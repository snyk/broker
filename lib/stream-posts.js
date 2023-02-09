const request = require('request');
const logger = require('./log');
const stream = require('stream');
const { replaceUrlPartialChunk } = require('./replace-vars');
module.exports = {
  initStream,
  pipeStream,
};

function initStream(config, brokerToken, streamingID, ioData, serverId) {
  const buffer = new stream.PassThrough({ highWaterMark: 1048576 });

  const url = new URL(
    `${config.brokerServerUrl}/response-data/${brokerToken}/${streamingID}`,
  );
  url.searchParams.append('server_id', serverId);
  const postRequestUrl = url.toString();

  const postRequest = request({
    url: postRequestUrl,
    method: 'post',
    headers: {
      'Content-Type': 'application/vnd.broker.stream+octet-stream',
      Connection: 'close',
    },
  });
  buffer.on('error', (e) =>
    logger.error({ error: e }, 'received error sending data to buffer'),
  );
  buffer.pipe(
    postRequest
      .on('error', (e) => {
        logger.error({ error: e }, 'received error sending data via POST');
      })
      .on('response', (r) => {
        if (r.statusCode !== 200) {
          logger.error(
            {
              statusCode: r.statusCode,
              statusMessage: r.statusMessage,
              headers: r.headers,
              body: r.body?.toString(),
            },
            'Received unexpected response uploading data',
          );
        }
      }),
  );
  logger.debug('Pipe set up');
  const ioDataLength = ioData.length;
  logger.debug(`ioData has length of ${ioDataLength}`);
  // Would be nice if there were a Unit32Array or a writeUint32 method, but noooooo...
  const ioDataLengthBinary = new Uint8Array(4);
  ioDataLengthBinary[0] = ioDataLength & 0xff;
  ioDataLengthBinary[1] = (ioDataLength >> 8) & 0xff;
  ioDataLengthBinary[2] = (ioDataLength >> 16) & 0xff;
  ioDataLengthBinary[3] = (ioDataLength >> 24) & 0xff;
  buffer.cork();
  buffer.write(ioDataLengthBinary);
  buffer.write(ioData);
  buffer.uncork();
  return buffer;
}

function pipeStream(
  rqst,
  logContext,
  config,
  brokerToken,
  streamingID,
  serverId,
) {
  let prevPartialChunk;
  let isResponseJson;
  let buffer = null;
  rqst
    .on('error', (e) => {
      logError(logContext, e);
      if (buffer) {
        buffer.destroy(e);
      } else {
        const body = JSON.stringify({ message: e.message });
        const buffer = initStream(
          config,
          brokerToken,
          streamingID,
          JSON.stringify({
            status: 500,
            headers: {
              'Content-Length': `${body.length}`,
              'Content-Type': 'application/json',
            },
          }),
          serverId,
        );
        buffer.write(body);
        buffer.end();
      }
    })
    .on('response', (response) => {
      logger.debug('Response received - setting up stream to Server');
      const status = response?.statusCode || 500;
      logResponse(logContext, status, response, config);
      isResponseJson = isJson(response.headers);
      const ioData = JSON.stringify({
        status,
        headers: response.headers,
      });
      buffer = initStream(config, brokerToken, streamingID, ioData, serverId);
    })
    .on('data', (chunk) => {
      logResponse(
        logContext,
        'undefined',
        { body: chunk.toString() },
        config,
        true,
      );
      logger.trace(`writing data of length ${chunk.length} to buffer`);
      if (config.RES_BODY_URL_SUB && isResponseJson) {
        const { newChunk, partial } = replaceUrlPartialChunk(
          Buffer.from(chunk).toString(),
          prevPartialChunk,
          config,
        );
        prevPartialChunk = partial;
        chunk = newChunk;
      }
      if (!buffer.write(chunk)) {
        logger.trace('pausing request stream');
        rqst.pause();
        buffer.once('drain', () => {
          logger.trace('resuming request stream');
          rqst.resume();
        });
      }
    })
    .on('end', () => {
      logger.debug('writing end to buffer');
      buffer.end();
    });
}

function isJson(responseHeaders) {
  return responseHeaders['content-type']?.includes('json') || false;
}

function logResponse(
  logContext,
  status,
  response,
  config = null,
  debugOnly = false,
) {
  logContext.httpStatus = status;
  logContext.httpHeaders = response.headers;
  logContext.httpBody =
    config && config.LOG_ENABLE_BODY === 'true' ? response.body : null;
  if (debugOnly) {
    logger.debug(logContext, 'posting response to Broker Server');
  } else {
    logger.info(logContext, 'posting response to Broker Server');
  }
}

function logError(logContext, error) {
  logContext.error = error;
  logger.error(
    logContext,
    'error while sending websocket request over HTTP connection',
  );
}
