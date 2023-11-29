import http from 'http';
import https from 'https';
import { getProxyForUrl } from 'proxy-from-env';
import { bootstrap } from 'global-agent';
import { log as logger } from '../../logs/logger';
import { PostFilterPreparedRequest } from '../relay/prepareRequest';
import { config } from '../config';
import { switchToInsecure } from './utils';
export interface HttpResponse {
  headers: Object;
  statusCode: number | undefined;
  statusText?: string;
  body: any;
}
const MAX_RETRY = config.MAX_RETRY || 3;

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
  retries = MAX_RETRY,
): Promise<HttpResponse> => {
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
  const httpClient = localRequest.url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: localRequest.method,
    headers: localRequest.headers as any,
  };

  return new Promise<HttpResponse>((resolve, reject) => {
    try {
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
            if (
              response.statusCode &&
              response.statusCode >= 200 &&
              response.statusCode < 300
            ) {
              logger.trace(
                { statusCode: response.statusCode, url: localRequest.url },
                `Successful request`,
              );
            } else {
              logger.debug(
                { statusCode: response.statusCode, url: localRequest.url },
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
          logger.warn(
            { url: localRequest.url, err: error },
            `Request failed. Retrying after 500ms...`,
          );
          setTimeout(() => {
            resolve(makeRequestToDownstream(localRequest, retries - 1));
          }, 500); // Wait for 0.5 second before retrying
        } else {
          logger.error(
            { url: localRequest.url, err: error },
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
  retries = MAX_RETRY,
): Promise<http.IncomingMessage> => {
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
  const httpClient = localRequest.url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: localRequest.method,
    headers: localRequest.headers as any,
  };

  return new Promise<http.IncomingMessage>((resolve, reject) => {
    try {
      const request = httpClient.request(
        localRequest.url,
        options,
        (response) => {
          if (
            response.statusCode &&
            response.statusCode >= 200 &&
            response.statusCode < 300
          ) {
            logger.info(
              {
                statusCode: response.statusCode,
                url: localRequest.url,
                headers: config.LOG_INFO_VERBOSE ? response.headers : {},
              },
              `Successful downstream request`,
            );
          } else {
            logger.warn(
              {
                statusCode: response.statusCode,
                url: localRequest.url,
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
          logger.warn(
            { url: req.url, err: error },
            `Request failed. Retrying after 500ms...`,
          );
          setTimeout(() => {
            resolve(
              makeStreamingRequestToDownstream(localRequest, retries - 1),
            );
          }, 500); // Wait for 0.5 second before retrying
        } else {
          logger.error(
            { url: localRequest.url, err: error },
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
  const httpClient = localRequest.url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: localRequest.method,
    headers: localRequest.headers as any,
  };

  return new Promise<HttpResponse>((resolve, reject) => {
    try {
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
      if (localRequest.body) {
        request.write(localRequest.body);
      }
      request.end();
    } catch (err) {
      reject(err);
    }
  });
};
