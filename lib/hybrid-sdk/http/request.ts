import http from 'http';
import https from 'https';
import { getProxyForUrl } from 'proxy-from-env';
import { bootstrap } from 'global-agent';
import { log as logger } from '../../logs/logger';

import { PostFilterPreparedRequest } from '../../broker-workload/prepareRequest';

import { getConfig } from '../common/config/config';
import { extractBrokerTokenFromUrl, maskToken } from '../common/utils/token';
import { switchToInsecure } from './utils';
import version from '../common/utils/version';
export interface HttpResponse {
  headers: Object;
  statusCode: number | undefined;
  statusText?: string;
  body: string;
}
const MAX_RETRY = getConfig().MAX_RETRY || 3;

if (process.env.HTTP_PROXY || process.env.http_proxy) {
  process.env.HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
}
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  process.env.HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
}
if (process.env.NP_PROXY || process.env.no_proxy) {
  process.env.NO_PROXY = process.env.NO_PROXY || process.env.no_proxy;
}

export const makeRequestToDownstream = async (
  req: PostFilterPreparedRequest,
  retries: number = MAX_RETRY,
): Promise<HttpResponse> => {
  const config = getConfig();
  const localRequest = req;
  if (config.INSECURE_DOWNSTREAM) {
    localRequest.url = switchToInsecure(localRequest.url);
  }
  const proxyUri = getProxyForUrl(localRequest.url);
  if (proxyUri) {
    bootstrap({
      environmentVariableNamespace: '',
    });
  }
  localRequest.headers['x-broker-origin-ua'] =
    localRequest.headers['user-agent'] ?? 'not-provided';
  localRequest.headers['user-agent'] = `Snyk Broker Client ${version}`;
  const httpClient = localRequest.url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: localRequest.method,
    headers: localRequest.headers,
  };

  return new Promise<HttpResponse>((resolve, reject) => {
    try {
      // deepcode ignore Ssrf: re-ignore after http client refactoring
      const request = httpClient.request(
        localRequest.url,
        options,
        (response) => {
          let data = '';

          // A chunk of data has been received.
          response.on('data', (chunk: string) => {
            data += chunk;
          });

          // The whole response has been received.
          response.on('end', () => {
            if (
              response.statusCode &&
              response.statusCode >= 200 &&
              response.statusCode < 300
            ) {
              const brokerToken = extractBrokerTokenFromUrl(localRequest.url)!;
              const maskedToken = maskToken(brokerToken);
              logger.trace(
                {
                  statusCode: response.statusCode,
                  url: localRequest.url.replaceAll(brokerToken, maskedToken),
                },
                `Successful request`,
              );
            } else {
              const brokerToken = extractBrokerTokenFromUrl(localRequest.url)!;
              const maskedToken = maskToken(brokerToken);
              logger.debug(
                {
                  statusCode: response.statusCode,
                  url: localRequest.url.replaceAll(brokerToken, maskedToken),
                },
                `Non 2xx HTTP Code Received`,
              );
            }
            resolve({
              headers: response.headers,
              statusCode: response.statusCode,
              body: data,
            });
          });
          response.on('error', (error) => {
            if (retries > 0) {
              logger.warn(
                { msg: localRequest.url },
                `Downstream Response failed. Retrying after 500ms...`,
              );
              setTimeout(() => {
                resolve(makeRequestToDownstream(localRequest, retries - 1));
              }, 500); // Wait for 0.5 second before retrying
            } else {
              logger.error(
                { error },
                `Error getting response from downstream. Giving up after ${MAX_RETRY} retries.`,
              );
              reject(error);
            }
          });
        },
      );
      // An error occurred while fetching.
      request.on('error', (error) => {
        if (retries > 0) {
          const brokerToken = extractBrokerTokenFromUrl(localRequest.url)!;
          const maskedToken = maskToken(brokerToken);
          logger.warn(
            {
              url: localRequest.url.replaceAll(brokerToken, maskedToken),
              err: error,
            },
            `Request failed. Retrying after 500ms...`,
          );
          setTimeout(() => {
            resolve(makeRequestToDownstream(localRequest, retries - 1));
          }, 500); // Wait for 0.5 second before retrying
        } else {
          const brokerToken = extractBrokerTokenFromUrl(localRequest.url)!;
          const maskedToken = maskToken(brokerToken);
          logger.error(
            {
              url: localRequest.url.replaceAll(brokerToken, maskedToken),
              err: error,
            },
            `Error making streaming request to downstream. Giving up after ${MAX_RETRY} retries.`,
          );
          reject(error);
        }
      });

      if (localRequest.body) {
        request.write(localRequest.body);
      }

      request.end();
    } catch (err) {
      reject(err);
    }
  });
};

export const makeStreamingRequestToDownstream = (
  req: PostFilterPreparedRequest,
  retries: number = MAX_RETRY,
): Promise<http.IncomingMessage> => {
  const config = getConfig();
  const localRequest = req;
  if (config.INSECURE_DOWNSTREAM) {
    localRequest.url = switchToInsecure(localRequest.url);
  }
  const proxyUri = getProxyForUrl(localRequest.url);
  if (proxyUri) {
    bootstrap({
      environmentVariableNamespace: '',
    });
  }
  localRequest.headers['x-broker-origin-ua'] =
    localRequest.headers['user-agent'] ?? 'not-provided';
  localRequest.headers['user-agent'] = `Snyk Broker Client ${version}`;
  const httpClient = localRequest.url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: localRequest.method,
    headers: localRequest.headers,
  };

  return new Promise<http.IncomingMessage>((resolve, reject) => {
    try {
      // deepcode ignore Ssrf: re-ignore after http client refactoring
      const request = httpClient.request(
        localRequest.url,
        options,
        (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 200 &&
            response.statusCode < 300
          ) {
            const brokerToken = extractBrokerTokenFromUrl(localRequest.url)!;
            const maskedToken = maskToken(brokerToken);
            logger.debug(
              {
                statusCode: response.statusCode,
                url: localRequest.url.replaceAll(brokerToken, maskedToken),
                headers: config.LOG_INFO_VERBOSE ? response.headers : {},
              },
              `Successful downstream request.`,
            );
          } else {
            const brokerToken = extractBrokerTokenFromUrl(localRequest.url)!;
            const maskedToken = maskToken(brokerToken);
            logger.warn(
              {
                statusCode: response.statusCode,
                url: localRequest.url.replaceAll(brokerToken, maskedToken),
                headers: response.headers,
              },
              `Non 2xx HTTP Code Received`,
            );
          }

          response.on('error', (error) => {
            if (retries > 0) {
              logger.warn(
                { msg: localRequest.url },
                `Downstream Response failed. Retrying after 500ms...`,
              );
              setTimeout(() => {
                resolve(
                  makeStreamingRequestToDownstream(localRequest, retries - 1),
                );
              }, 500); // Wait for 0.5 second before retrying
            } else {
              logger.error(
                { error },
                `Error getting response from downstream. Giving up after ${MAX_RETRY} retries.`,
              );
              reject(error);
            }
          });

          resolve(response);
        },
      );
      request.on('error', (error) => {
        if (retries > 0) {
          const brokerToken = extractBrokerTokenFromUrl(req.url)!;
          const maskedToken = maskToken(brokerToken);
          logger.warn(
            {
              url: req.url.replaceAll(brokerToken, maskedToken),
              err: error,
            },
            `Request failed. Retrying after 500ms...`,
          );
          setTimeout(() => {
            resolve(
              makeStreamingRequestToDownstream(localRequest, retries - 1),
            );
          }, 500); // Wait for 0.5 second before retrying
        } else {
          const brokerToken = extractBrokerTokenFromUrl(localRequest.url)!;
          const maskedToken = maskToken(brokerToken);
          logger.error(
            {
              url: localRequest.url.replaceAll(brokerToken, maskedToken),
              err: error,
            },
            `Error making request to downstream. Giving up after ${MAX_RETRY} retries.`,
          );
          reject(error);
        }
      });
      if (localRequest.body) {
        request.write(localRequest.body);
      }
      request.end();
    } catch (err) {
      reject(err);
    }
  });
};

export const makeSingleRawRequestToDownstream = async (
  req: PostFilterPreparedRequest,
): Promise<HttpResponse> => {
  const config = getConfig();
  const localRequest = req;
  if (config.INSECURE_DOWNSTREAM) {
    localRequest.url = switchToInsecure(localRequest.url);
  }
  const proxyUri = getProxyForUrl(localRequest.url);
  if (proxyUri) {
    bootstrap({
      environmentVariableNamespace: '',
    });
  }
  localRequest.headers['x-broker-origin-ua'] =
    localRequest.headers['user-agent'] ?? 'not-provided';
  localRequest.headers['user-agent'] = `Snyk Broker Client ${version}`;
  const httpClient = localRequest.url.startsWith('https') ? https : http;
  const timeoutMs = req.timeoutMs ?? 0;
  const options: http.RequestOptions = {
    method: localRequest.method,
    headers: localRequest.headers,
    timeout: timeoutMs,
  };
  return new Promise<HttpResponse>((resolve, reject) => {
    try {
      // deepcode ignore Ssrf: re-ignore after http client refactoring
      const request = httpClient.request(
        localRequest.url,
        options,
        (response) => {
          let data = '';

          // A chunk of data has been received.
          response.on('data', (chunk) => {
            data += chunk;
          });

          // The whole response has been received.
          response.on('end', () => {
            resolve({
              headers: response.headers,
              statusCode: response.statusCode,
              statusText: response.statusMessage || '',
              body: data,
            });
          });
          // An error occurred while fetching.
          response.on('error', (error) => {
            logger.error({ error }, 'Error making request to downstream.');
            reject(error);
          });
        },
      );
      request.on('error', (error) => {
        logger.error({ error }, 'Error making request to downstream.');
        reject(error);
      });
      request.on('timeout', () => {
        request.destroy(); // Abort the request if it times out
        logger.info(`Request to URI ${localRequest.url} timed out.`);
        reject(new Error(`Request to URI ${localRequest.url} timed out.`));
      });
      if (localRequest.body) {
        request.write(localRequest.body);
      }
      request.end();
    } catch (err) {
      reject(err);
    }
  });
};
