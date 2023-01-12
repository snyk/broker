const request = require('request');
const logger = require('./log');
const stream = require('stream');
const { replaceUrlPartialChunk } = require('./replace-vars');

const MAX_ATTEMPTS = 3;

class ResponseStreamer {
  #logContext;
  #config;
  #brokerToken;
  #streamingID;

  #buffer;

  constructor(logContext, config, brokerToken, streamingID) {
    this.#logContext = logContext;
    this.#config = config;
    this.#brokerToken = brokerToken;
    this.#streamingID = streamingID;
  }

  initStream(ioData) {
    this.#buffer = new stream.PassThrough({ highWaterMark: 1048576 });
    const postRequest = request({
      url: `${this.#config.brokerServerUrl}/response-data/${
        this.#brokerToken
      }/${this.#streamingID}`,
      method: 'post',
      headers: {
        'Content-Type': 'application/vnd.broker.stream+octet-stream',
        Connection: 'close',
      },
    });
    this.#buffer.on('error', (e) =>
      logger.error({ error: e }, 'received error sending data to buffer'),
    );
    this.#buffer.pipe(
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
    this.#buffer.cork();
    this.#buffer.write(ioDataLengthBinary);
    this.#buffer.write(ioData);
    this.#buffer.uncork();
  }

  sendData(statusAndHeaders, body) {
    logger.trace(
      { ...this.#logContext, statusAndHeaders, body },
      "posting internal response back to Broker Server as it's expecting streaming response",
    );
    this.initStream(JSON.stringify(statusAndHeaders));
    this.#buffer.write(typeof body !== 'string' ? JSON.stringify(body) : body);
    this.#buffer.end();
  }

  pipeStream(rqst) {
    let prevPartialChunk;
    let isResponseJson;
    rqst
      .on('error', (e) => {
        this.#logError(e);
        if (this.#buffer) {
          this.#buffer.destroy(e);
        } else {
          const body = JSON.stringify({ message: e.message });
          const doSend = () => {
            this.initStream(
              JSON.stringify({
                status: 500,
                headers: {
                  'Content-Length': `${body.length}`,
                  'Content-Type': 'application/json',
                },
              }),
            );
            this.#buffer.write(body);
            this.#buffer.end();
          };

          doSend();
        }
      })
      .on('response', (response) => {
        logger.debug(
          this.#logContext,
          'Response received - setting up stream to Server',
        );
        const status = response?.statusCode || 500;
        this.#logResponse(status, response);
        isResponseJson = this.#isJson(response.headers);
        const ioData = JSON.stringify({
          status,
          headers: response.headers,
        });
        this.initStream(ioData);
      })
      .on('data', (chunk) => {
        logger.trace(`writing data of length ${chunk.length} to buffer`);
        if (this.#config.RES_BODY_URL_SUB && isResponseJson) {
          const { newChunk, partial } = replaceUrlPartialChunk(
            Buffer.from(chunk).toString(),
            prevPartialChunk,
            this.#config,
          );
          prevPartialChunk = partial;
          chunk = newChunk;
        }
        if (!this.#buffer.write(chunk)) {
          logger.trace('pausing request stream');
          rqst.pause();
          this.#buffer.once('drain', () => {
            logger.trace('resuming request stream');
            rqst.resume();
          });
        }
      })
      .on('end', () => {
        logger.debug('writing end to buffer');
        this.#buffer.end();
      });
  }

  #isJson(responseHeaders) {
    return responseHeaders['content-type']?.includes('json') || false;
  }

  #logResponse(status, response) {
    logger.info(
      {
        ...this.#logContext,
        httpStatus: status,
        httpHeaders: response.headers,
        httpBody:
          this.#config && this.#config.LOG_ENABLE_BODY === 'true'
            ? response.body
            : null,
      },
      'posting response to Broker Server',
    );
  }

  #logError(error) {
    logger.error(
      { ...this.#logContext, error },
      'error while sending websocket request over HTTP connection',
    );
  }
}

module.exports = {
  ResponseStreamer,
};
