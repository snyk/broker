import http from 'http';
import https from 'https';
import { getProxyForUrl } from 'proxy-from-env';
import { bootstrap } from 'global-agent';
import { log as logger } from '../../logs/logger';
import { PostFilterPreparedRequest } from '../relay/prepareRequest';
import { config } from '../config';
export interface HttpResponse {
  headers: Object;
  statusCode: number | undefined;
  statusText?: string;
  body: any;
}

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
  retries = config.MAX_RETRY || 3,
): Promise<HttpResponse> => {
  const proxyUri = getProxyForUrl(req.url);
  if (proxyUri) {
    bootstrap({
      environmentVariableNamespace: '',
    });
  }
  const httpClient = req.url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: req.method,
    headers: req.headers as any,
  };

  return new Promise<HttpResponse>((resolve, reject) => {
    try {
      const request = httpClient.request(req.url, options, (response) => {
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
            resolve({
              headers: response.headers,
              statusCode: response.statusCode,
              body: data,
            });
          } else {
            logger.error(
              { msg: response.statusCode || 'NO RESPONSE CODE' },
              'Error making request to downstream - Unexpected Response',
            );
            reject('Error making request to downstream - Unexpected Response');
          }
        });

        // An error occurred while fetching.
        response.on('error', (error) => {
          if (retries > 0) {
            logger.warn(
              { msg: req.url },
              `Request failed. Retrying after 500ms...`,
            );
            setTimeout(() => {
              resolve(makeRequestToDownstream(req, retries - 1));
            }, 500); // Wait for 0.5 second before retrying
          } else {
            logger.error(
              { error },
              'Error making request to downstream. Giving up after retries.',
            );
            reject(error);
          }
        });
      });
      if (req.body) {
        request.write(req.body);
      }
      request.end();
    } catch (err) {
      reject(err);
    }
  });
};

export const makeStreamingRequestToDownstream = (
  req: PostFilterPreparedRequest,
  retries = config.MAX_RETRY || 3,
): Promise<http.IncomingMessage> => {
  const proxyUri = getProxyForUrl(req.url);
  if (proxyUri) {
    bootstrap({
      environmentVariableNamespace: '',
    });
  }
  const httpClient = req.url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: req.method,
    headers: req.headers as any,
  };

  return new Promise<http.IncomingMessage>((resolve, reject) => {
    try {
      const request = httpClient.request(req.url, options, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 200 &&
          response.statusCode < 300
        ) {
          resolve(response);
        } else {
          if (retries > 0) {
            logger.warn(
              { msg: req.url },
              `Request failed. Retrying after 500ms...`,
            );
            setTimeout(() => {
              resolve(makeStreamingRequestToDownstream(req, retries - 1));
            }, 500); // Wait for 0.5 second before retrying
          } else {
            logger.error(
              { msg: req.url },
              'Error making request to downstream. Giving up after retries.',
            );
            reject(
              'Error making request to downstream. Giving up after retries.',
            );
          }
        }
      });
      if (req.body) {
        request.write(req.body);
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
  const proxyUri = getProxyForUrl(req.url);
  if (proxyUri) {
    bootstrap({
      environmentVariableNamespace: '',
    });
  }
  const httpClient = req.url.startsWith('https') ? https : http;
  const options: http.RequestOptions = {
    method: req.method,
    headers: req.headers as any,
  };

  return new Promise<HttpResponse>((resolve, reject) => {
    try {
      const request = httpClient.request(req.url, options, (response) => {
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
          logger.error(
            { error },
            'Error making request to downstream. Giving up after retries.',
          );
          reject(error);
        });
      });
      if (req.body) {
        request.write(req.body);
      }
      request.end();
    } catch (err) {
      reject(err);
    }
  });
};
