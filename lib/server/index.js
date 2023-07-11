const logger = require('../log');
const socket = require('./socket');
const relay = require('../relay');
const version = require('../version');
const { maskToken, hashToken } = require('../token');
const metrics = require('../metrics');
const { applyPrometheusMiddleware } = require('./prometheus-middleware');
const { validateBrokerTypeMiddleware } = require('./broker-middleware');

module.exports = async ({ config = {}, port = null, filters = {} }) => {
  logger.info({ version }, 'running in server mode');

  // start the local webserver to listen for relay requests
  const { app, server } = require('../webserver')(config, port);
  // Requires are done recursively, so this is here to avoid contaminating the Client
  const dispatcher = require('../dispatcher');
  const onSignal = async () => {
    logger.debug('received exit signal, closing server');
    await dispatcher.serverStopping(() => {
      process.exit(0);
    });
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  await dispatcher.serverStarting();

  // bind the socket server to the web server
  const { io, connections } = socket({
    server,
    filters: filters.private,
    config,
  });

  if (!process.env.JEST_WORKER_ID) {
    app.use(applyPrometheusMiddleware());
  }
  app.get('/connection-status/:token', (req, res) => {
    const token = req.params.token;
    const maskedToken = maskToken(token);
    const hashedToken = hashToken(token);
    if (connections.has(token)) {
      const clientsMetadata = connections.get(token).map((conn) => ({
        version: conn.metadata && conn.metadata.version,
        filters: conn.metadata && conn.metadata.filters,
      }));
      return res.status(200).json({ ok: true, clients: clientsMetadata });
    }
    logger.warn({ maskedToken, hashedToken }, 'no matching connection found');
    return res.status(404).json({ ok: false });
  });

  // Universal Broker mode, requests must specify type of client targeted on that now generic connection
  app.all(
    '/broker/universal/:typeId/:token/*',
    (req, res, next) => {
      const token = req.params.token;
      const typeId = req.params.typeId;
      const maskedToken = maskToken(token);
      const hashedToken = hashToken(token);
      req.maskedToken = maskedToken;
      req.hashedToken = hashedToken;

      // check if we have this broker in the connections
      if (!connections.has(token)) {
        metrics.incrementHttpRequestsTotal(false);
        logger.warn(
          { maskedToken, hashedToken },
          'no matching connection found',
        );
        return res.status(404).json({ ok: false });
      }

      // Grab a first (newest) client from the pool
      // This is really silly...
      res.locals.io = connections.get(token)[0].socket;
      res.locals.socketVersion = connections.get(token)[0].socketVersion;
      res.locals.capabilities = connections.get(token)[0].metadata.capabilities;
      req.locals = {};
      req.locals.capabilities = connections.get(token)[0].metadata.capabilities;

      // strip the leading url
      req.url = req.url.slice(`/broker/universal/${typeId}/${token}`.length);
      req.headers['x-snyk-broker-type'] = typeId;
      logger.debug({ url: req.url, typeId: typeId }, 'request');

      next();
    },
    validateBrokerTypeMiddleware,
    relay.request(filters.public),
  );

  app.all(
    '/broker/:token/*',
    (req, res, next) => {
      const token = req.params.token;
      const maskedToken = maskToken(token);
      const hashedToken = hashToken(token);
      req.maskedToken = maskedToken;
      req.hashedToken = hashedToken;

      // check if we have this broker in the connections
      if (!connections.has(token)) {
        metrics.incrementHttpRequestsTotal(false);
        logger.warn(
          { maskedToken, hashedToken },
          'no matching connection found',
        );
        return res.status(404).json({ ok: false });
      }

      // Grab a first (newest) client from the pool
      // This is really silly...
      res.locals.io = connections.get(token)[0].socket;
      res.locals.socketVersion = connections.get(token)[0].socketVersion;
      res.locals.capabilities = connections.get(token)[0].metadata.capabilities;
      req.locals = {};
      req.locals.capabilities = connections.get(token)[0].metadata.capabilities;

      // strip the leading url
      req.url = req.url.slice(`/broker/${token}`.length);
      logger.debug({ url: req.url }, 'request');

      next();
    },
    relay.request(filters.public),
  );

  app.post('/response-data/:brokerToken/:streamingId', (req, res) => {
    metrics.incrementHttpRequestsTotal(false);
    const token = req.params.brokerToken;
    const streamingID = req.params.streamingId;
    const maskedToken = maskToken(token);
    const hashedToken = hashToken(token);
    const logContext = {
      hashedToken,
      maskedToken,
      streamingID,
      requestId: req.headers['snyk-request-id'],
    };
    logger.info(logContext, 'Handling response-data request');
    req.maskedToken = maskedToken;
    req.hashedToken = hashedToken;

    const streamHandler = relay.StreamResponseHandler.create(streamingID);
    if (!streamHandler) {
      logger.error(logContext, 'unable to find request matching streaming id');
      res
        .status(500)
        .json({ message: 'unable to find request matching streaming id' });
      return;
    }
    let statusAndHeaders = '';
    let statusAndHeadersSize = -1;

    req
      .on('data', function (data) {
        try {
          logger.trace(
            { ...logContext, dataLength: data.length },
            'Received data event',
          );
          let bytesRead = 0;
          if (statusAndHeadersSize === -1) {
            bytesRead += 4;
            statusAndHeadersSize = data.readUInt32LE();
            logger.debug(
              { ...logContext, statusAndHeadersSize },
              'request metadata size read from stream',
            );
          }

          if (
            statusAndHeadersSize > 0 &&
            statusAndHeaders.length < statusAndHeadersSize
          ) {
            const endPosition = Math.min(
              bytesRead + statusAndHeadersSize - statusAndHeaders.length,
              data.length,
            );
            logger.trace(
              { ...logContext, bytesRead, endPosition },
              'Reading ioJson',
            );
            statusAndHeaders += data.toString('utf8', bytesRead, endPosition);
            bytesRead = endPosition;

            if (statusAndHeaders.length === statusAndHeadersSize) {
              logger.trace(
                { ...logContext, statusAndHeaders },
                'Converting to json',
              );
              const statusAndHeadersJson = JSON.parse(statusAndHeaders);
              const logData = {
                ...logContext,
                responseStatus: statusAndHeadersJson.status,
                responseHeaders: statusAndHeadersJson.headers,
              };
              const logMessage = 'Handling response-data request - io bits';
              if (
                statusAndHeadersJson.status > 299 &&
                statusAndHeadersJson.status !== 404
              ) {
                logger.info(logData, logMessage);
              } else {
                logger.debug(logData, logMessage);
              }
              streamHandler.writeStatusAndHeaders(statusAndHeadersJson);
            } else {
              logger.trace(
                {
                  ...logContext,
                  currentSize: statusAndHeaders.length,
                  expectedSize: statusAndHeadersSize,
                },
                'Was unable to fit all information into a single data object',
              );
            }
          }

          if (bytesRead < data.length) {
            logger.trace(
              logContext,
              'Handling response-data request - data part',
            );
            streamHandler.writeChunk(
              data.subarray(bytesRead, data.length),
              (streamBuffer) => {
                logger.trace(logContext, 'pausing request stream');
                req.pause();
                streamBuffer.once('drain', () => {
                  logger.trace(logContext, 'resuming request stream');
                  req.resume();
                });
              },
            );
          }
        } catch (e) {
          logger.error(
            { ...logContext, statusAndHeaders, statusAndHeadersSize, error: e },
            'caught error handling data event for streaming HTTP response',
          );
        }
      })
      .on('end', function () {
        logger.debug(logContext, 'Handling response-data request - end part');
        streamHandler.finished();
        res.status(200).json({});
      })
      .on('error', (err) => {
        logger.error(
          { ...logContext, error: err },
          'received error handling POST from client',
        );
        streamHandler.destroy(err);
        res.status(500).json({ err });
      });
  });

  app.get('/', (req, res) => res.status(200).json({ ok: true, version }));

  app.get('/healthcheck', (req, res) =>
    res.status(200).json({ ok: true, version }),
  );

  return {
    io,
    close: (done) => {
      logger.info('server websocket is closing');
      server.close();
      io.destroy(function () {
        logger.info('server websocket is closed');
        if (done) {
          return done();
        }
      });
    },
  };
};
