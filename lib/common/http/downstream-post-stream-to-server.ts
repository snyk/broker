import { log as logger } from '../../logs/logger';
import stream from 'stream';
import version from '../utils/version';
import { replaceUrlPartialChunk } from '../utils/replace-vars';
import { getProxyForUrl } from 'proxy-from-env';
import { bootstrap } from 'global-agent';
import https from 'https';
import http from 'http';

const BROKER_CONTENT_TYPE = 'application/vnd.broker.stream+octet-stream';

class BrokerServerPostResponseHandler {
  #buffer;
  #logContext;
  #config;
  #brokerToken;
  #streamingId;
  #serverId;
  #requestId;
  #brokerServerPostRequestHttp;

  constructor(
    logContext,
    config,
    brokerToken,
    streamingId,
    serverId,
    requestId,
  ) {
    this.#logContext = logContext;
    this.#config = config;
    this.#brokerToken = brokerToken;
    this.#streamingId = streamingId;
    this.#serverId = serverId;
    this.#requestId = requestId;
  }

  async #initBuffer() {
    this.#buffer = new stream.PassThrough({ highWaterMark: 1048576 });

    const url = new URL(
      `${this.#config.brokerServerUrl}/response-data/${this.#brokerToken}/${
        this.#streamingId
      }`,
    );
    if (this.#serverId) {
      url.searchParams.append('server_id', this.#serverId);
    }
    const brokerServerPostRequestUrl = url.toString();

    const client = brokerServerPostRequestUrl.startsWith('https')
      ? https
      : http;

    const keepAliveAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 60000,
      maxTotalSockets: 1000,
    });

    const options = {
      method: 'post',
      headers: {
        'Snyk-Request-Id': `${this.#requestId}`,
        'Content-Type': BROKER_CONTENT_TYPE,
        Connection: 'Keep-Alive',
        'Keep-Alive': 'timeout=60, max=1000',
        'user-agent': 'Snyk Broker client ' + version,
      },
      keepAliveAgent,
      timeout: process.env.BROKER_DOWNSTREAM_TIMEOUT
        ? parseInt(process.env.BROKER_DOWNSTREAM_TIMEOUT)
        : 60000,
    };
    if (process.env.HTTP_PROXY || process.env.http_proxy) {
      process.env.HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
    }
    if (process.env.HTTPS_PROXY || process.env.https_proxy) {
      process.env.HTTPS_PROXY =
        process.env.HTTPS_PROXY || process.env.https_proxy;
    }
    if (process.env.NP_PROXY || process.env.no_proxy) {
      process.env.NO_PROXY = process.env.NO_PROXY || process.env.no_proxy;
    }

    // this leaks memory on Node 18. node 20 seems fine
    this.#brokerServerPostRequestHttp = client.request(
      brokerServerPostRequestUrl,
      options,
    );
    const proxyUri = getProxyForUrl(brokerServerPostRequestUrl);
    if (proxyUri) {
      bootstrap({
        environmentVariableNamespace: '',
      });
    }

    this.#buffer.on('error', (e) =>
      logger.error(
        {
          ...this.#logContext,
          error: e,
          stackTrace: new Error('stacktrace generator').stack,
        },
        'received error sending data to broker server post request buffer',
      ),
    );
    this.#buffer.pipe(
      this.#brokerServerPostRequestHttp
        .on('error', (e) => {
          logger.error(
            {
              ...this.#logContext,
              error: e,
              stackTrace: new Error('stacktrace generator').stack,
            },
            'received error sending data via POST to Broker Server',
          );
          this.#buffer.destroy(e);
        })
        .on('response', (r) => {
          if (r.statusCode !== 200) {
            logger.error(
              {
                ...this.#logContext,
                statusCode: r.statusCode,
                statusMessage: r.statusMessage,
                headers: r.headers,
                body: r.body?.toString(),
                stackTrace: new Error('stacktrace generator').stack,
              },
              'Received unexpected HTTP response POSTing data to Broker Server',
            );
          }
        })
        .on('end', () => {
          logger.debug(
            {},
            `Streaming to broker server completed ${this.#streamingId}`,
          );
          // this.#buffer.end();
        }),
    );
    logger.debug(this.#logContext, `Pipe set up ${this.#streamingId}`);
  }

  #sendIoData(ioData) {
    const ioDataLength = ioData.length;
    logger.debug(
      { ...this.#logContext, ioDataLength },
      `sending ioData (Status & Headers) to Broker Server`,
    );
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

  #handleRequestError(error) {
    // For reasons unknown, doing foo.on(this.#func)
    // doesn't work - you need return a function from here

    logger.error(
      {
        ...this.#logContext,
        error,
        stackTrace: new Error('stacktrace generator').stack,
      },
      'received error from request while piping to Broker Server',
    );
    // If we already have a buffer object, then we've already started sending data back to the original requestor,
    // so we have to destroy the stream and let that flow through the system
    // If we *don't* have a buffer object, then there was a major failure with the request (e.g., host not found), so
    // we will forward that directly to the Broker Server
    if (this.#buffer) {
      this.#buffer.destroy(error);
    } else {
      const body = JSON.stringify({ error: error });
      this.#initBuffer();
      this.#sendIoData(
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
    }
  }

  async forwardRequest(responsePromise: NodeJS.ReadableStream) {
    let prevPartialChunk;
    let isResponseJson;

    responsePromise
      .on('response', (response) => {
        const status = response?.statusCode || 500;
        logger.info(
          {
            ...this.#logContext,
            responseStatus: status,
            responseHeaders: response.headers,
          },
          'response received, setting up stream to Broker Server',
        );
        isResponseJson = isJson(response.headers);
        const ioData = JSON.stringify({
          status,
          headers: response.headers,
        });

        this.#initBuffer();
        this.#sendIoData(ioData);
        logger.info(
          this.#logContext,
          'successfully sent status & headers to Broker Server',
        );
      })
      .on('data', async (data) => {
        let chunk = data;
        const httpBody =
          this.#config && this.#config.LOG_ENABLE_BODY === 'true'
            ? { body: chunk.toString() }.body
            : null;
        logger.debug(
          { ...this.#logContext, chunkLength: chunk.length, httpBody },
          'writing data to buffer',
        );
        if (this.#config.RES_BODY_URL_SUB && isResponseJson) {
          const { newChunk, partial } = replaceUrlPartialChunk(
            chunk,
            prevPartialChunk,
            this.#config,
          );
          prevPartialChunk = partial;
          chunk = newChunk;
        }
        if (!this.#buffer.write(chunk)) {
          logger.trace(this.#logContext, 'pausing request stream');
          responsePromise.pause();
          this.#buffer.once('drain', () => {
            logger.trace(this.#logContext, 'resuming request stream');
            responsePromise.resume();
          });
        }
      })
      .on('error', (err) => this.#handleRequestError(err))
      .on('end', () => {
        logger.info(this.#logContext, 'writing end to buffer');
      });
  }

  sendData(responseData) {
    const body = responseData.body;
    delete responseData.body;
    logger.debug(
      { ...this.#logContext, responseData, body },
      'posting internal response back to Broker Server as it is expecting streaming response',
    );
    this.#initBuffer();
    this.#sendIoData(JSON.stringify(responseData));
    this.#buffer.write(JSON.stringify(body));
    this.#buffer.end();
  }
}

function isJson(responseHeaders) {
  return responseHeaders['content-type']?.includes('json') || false;
}

export { BrokerServerPostResponseHandler };
