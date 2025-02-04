import { log as logger } from '../../logs/logger';
import stream from 'stream';
import { pipeline } from 'stream/promises';
import { replaceUrlPartialChunk } from '../../common/utils/replace-vars';
import version from '../../common/utils/version';

import { getProxyForUrl } from 'proxy-from-env';
import { bootstrap } from 'global-agent';
import https from 'https';
import http from 'http';
import { getConfig } from '../../common/config/config';
import { getClientOpts } from '../../client/config/configHelpers';

const BROKER_CONTENT_TYPE = 'application/vnd.broker.stream+octet-stream';

const client = getConfig().brokerServerUrl?.startsWith('https') ? https : http;

if (process.env.HTTP_PROXY || process.env.http_proxy) {
  process.env.HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
}
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  process.env.HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
}
if (process.env.NP_PROXY || process.env.no_proxy) {
  process.env.NO_PROXY = process.env.NO_PROXY || process.env.no_proxy;
}
const proxyUri = getProxyForUrl(getConfig().brokerServerUrl);
if (proxyUri) {
  bootstrap({
    environmentVariableNamespace: '',
  });
}
class BrokerServerPostResponseHandler {
  #buffer;
  #brokerTransformer;
  #logContext;
  #config;
  #brokerToken;
  #streamingId;
  #serverId;
  #role;
  #requestId;
  #brokerSrvPostRequestHandler;

  constructor(logContext, config, brokerToken, serverId, requestId, role) {
    this.#logContext = logContext;
    this.#config = config;
    this.#brokerToken = brokerToken;
    this.#serverId = serverId;
    this.#role = role;
    this.#requestId = requestId;
    this.#buffer = new stream.PassThrough({ highWaterMark: 1048576 });
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
  }

  async #initHttpClientRequest() {
    try {
      const backendHostname =
        this.#config.universalBrokerEnabled && this.#config.universalBrokerGa
          ? `${this.#config.brokerServerUrl}/hidden/brokers`
          : `${this.#config.brokerServerUrl}`;

      const url = new URL(
        `${backendHostname}/response-data/${this.#brokerToken}/${
          this.#streamingId
        }`,
      );

      if (this.#serverId) {
        url.searchParams.append('server_id', this.#serverId);
      }
      if (this.#role) {
        url.searchParams.append('connection_role', this.#role);
      }
      const brokerServerPostRequestUrl = url.toString();

      const options = {
        method: 'post',
        headers: {
          'Snyk-Request-Id': `${this.#requestId}`,
          'Snyk-acting-org-public-id': `${this.#logContext.actingOrgPublicId}`,
          'Snyk-acting-group-public-id': `${
            this.#logContext.actingGroupPublicId
          }`,
          'Snyk-product-line': `${this.#logContext.productLine}`,
          'Snyk-flow-name': `${this.#logContext.flow}`,
          'Content-Type': BROKER_CONTENT_TYPE,
          Connection: 'close',
          'user-agent': 'Snyk Broker client ' + version,
          'x-broker-client-version': version,
        },
        timeout: this.#config.brokerClientPostTimeout
          ? parseInt(this.#config.brokerClientPostTimeout)
          : 1200000,
      };
      if (getClientOpts().accessToken && this.#config.universalBrokerGa) {
        options.headers['authorization'] =
          getClientOpts().accessToken.authHeader;
      }

      this.#brokerSrvPostRequestHandler = client.request(
        brokerServerPostRequestUrl,
        options,
      );

      this.#brokerSrvPostRequestHandler
        .on('error', (e) => {
          logger.error(
            {
              errMsg: e.message,
              errDetails: e,
              stackTrace: new Error('stacktrace generator').stack,
            },
            'received error sending data via POST to Broker Server',
          );
          this.#buffer.end(e.message);
        })
        .on('response', (r) => {
          r.on('error', (err) => {
            logger.error(
              {
                errMsg: err.message,
                errDetails: err,
                stackTrace: new Error('stacktrace generator').stack,
              },
              'Stream Response error in POST to Broker Server',
            );
          });
          if (r.statusCode !== 200) {
            logger.error(
              {
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
        .on('finish', () => {
          logger.debug(this.#logContext, 'Finish Post Request Handler Event');
        })
        .on('close', () => {
          logger.debug(this.#logContext, 'Close Post Request Handler Event');
        });

      logger.debug(this.#logContext, 'POST Request Client setup');
    } catch (err) {
      logger.error({ err }, 'Error init Client for POST Broker Server Stream');
    }
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

  #handleRequestError() {
    // For reasons unknown, doing foo.on(this.#func)
    // doesn't work - you need return a function from here
    return (error) => {
      logger.error(
        {
          ...this.#logContext,
          error,
          stackTrace: new Error('stacktrace generator').stack,
        },
        'received error from downstream request while streaming data to Broker Server',
      );
      // If we already have a buffer object, then we've already started sending data back to the original requestor,
      // so we have to destroy the stream and let that flow through the system
      // If we *don't* have a buffer object, then there was a major failure with the request (e.g., host not found), so
      // we will forward that directly to the Broker Server
      if (this.#buffer) {
        this.#buffer.end(error.message);
      } else {
        const body = JSON.stringify({ error: error });
        this.#sendIoData(
          JSON.stringify({
            status: 500,
            headers: {
              'Content-Length': `${body.length}`,
              'Content-Type': 'application/json',
            },
          }),
        );
        this.#buffer.write(Buffer.from(body));
        this.#buffer.end();
      }
    };
  }

  async forwardRequest(response: http.IncomingMessage, streamingID) {
    const config = this.#config;
    try {
      this.#streamingId = streamingID;
      let prevPartialChunk;
      response.socket.on('error', (err) => {
        logger.error(
          {
            msg: err.message,
            err: err,
            stackTrace: new Error('stacktrace generator').stack,
          },
          'Socket Response error in Streaming from downstream',
        );
      });
      const status = response?.statusCode || 500;
      logger.debug(
        {
          ...this.#logContext,
          responseStatus: status,
          responseHeaders: response.headers,
        },
        'response received, setting up stream to Broker Server',
      );
      const isResponseJson = isJson(response.headers);
      const ioData = JSON.stringify({
        status,
        headers: response.headers,
      });
      this.#initHttpClientRequest();
      this.#sendIoData(ioData);
      logger.debug(
        this.#logContext,
        'successfully sent status & headers to Broker Server',
      );
      const localLogContext = this.#logContext;
      // TODO: break into 2 distinct transform, only to add to pipeline if conditions are met
      // Take out of here if possible
      logger.debug(this.#logContext, 'Setting up transformers');
      this.#brokerTransformer = new stream.Transform({
        transform(chunk, encoding, callback) {
          const httpBody =
            config && config.LOG_ENABLE_BODY === 'true'
              ? { body: chunk.toString() }.body
              : null;
          logger.debug(
            { ...localLogContext, chunkLength: chunk.length, httpBody },
            'writing data to buffer',
          );
          if (config.RES_BODY_URL_SUB && isResponseJson) {
            const { newChunk, partial } = replaceUrlPartialChunk(
              Buffer.from(chunk).toString(),
              prevPartialChunk,
              config,
            );
            prevPartialChunk = partial;
            chunk = newChunk;
          }
          callback(null, chunk);
        },
      });
      response.on('error', this.#handleRequestError());

      if (
        (config && config.LOG_ENABLE_BODY === 'true') ||
        (config.RES_BODY_URL_SUB && isResponseJson)
      ) {
        logger.debug(
          this.#logContext,
          'Pipelining with body logging on or Body replace ',
        );
        await pipeline(
          response,
          this.#buffer,
          this.#brokerTransformer,
          this.#brokerSrvPostRequestHandler,
        );
      } else {
        logger.debug(this.#logContext, 'Pipelining standard');
        await pipeline(
          response,
          this.#buffer,
          this.#brokerSrvPostRequestHandler,
        );
      }
    } catch (err) {
      logger.error(
        { err },
        'Error in forwarding the request to broker server pipeline',
      );
    }
  }

  async sendData(responseData, streamingID) {
    this.#streamingId = streamingID;
    const body = responseData.body;
    delete responseData.body;
    logger.debug(
      { ...this.#logContext, responseData, body },
      'posting internal response back to Broker Server as it is expecting streaming response',
    );
    this.#initHttpClientRequest();
    pipeline(this.#buffer, this.#brokerSrvPostRequestHandler);
    this.#sendIoData(JSON.stringify(responseData));
    this.#buffer.write(JSON.stringify(body));
    this.#buffer.end();
  }
}

function isJson(responseHeaders) {
  return responseHeaders['content-type']?.includes('json') || false;
}

export { BrokerServerPostResponseHandler };
