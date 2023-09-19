// CAUTION, needle is pinned to 3.0.0 because of https://github.com/tomas/needle/issues/406. need to help needle team to fix this.
import needle from 'needle';
import { parse } from 'url';
import https from 'https';
import http from 'http';
import { PostFilterPreparedRequest } from '../relay/prepareRequest';
import { bootstrap } from 'global-agent';
import { getProxyForUrl } from 'proxy-from-env';
import { log as logger } from '../../logs/logger';

const setupRequest = (req) => {
  if (process.env.HTTP_PROXY || process.env.http_proxy) {
    process.env.HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy;
  }
  if (process.env.HTTPS_PROXY || process.env.https_proxy) {
    process.env.HTTPS_PROXY =
      process.env.HTTPS_PROXY || process.env.https_proxy;
  }

  const data = req.body ? Buffer.from(req.body) : null;
  if (!req.headers) {
    req.headers = {};
  }
  req.headers['Connection']='keep-alive'
  const parsedUrl = parse(req.url);

  const method = (req.method || 'get').toLowerCase() as needle.NeedleHttpVerbs;
  const url = req.url;

  const agent =
    parsedUrl.protocol === 'http:'
      ? new http.Agent({ keepAlive: true, keepAliveMsecs: 60000, maxTotalSockets: 1000 })
      : new https.Agent({ keepAlive: true, keepAliveMsecs: 60000, maxTotalSockets: 1000 });

  const options: needle.NeedleOptions = {
    headers: req.headers,
    timeout: req.timeout,
    follow_max: 5,
    agent,
    parse: false,
  };

  const proxyUri = getProxyForUrl(url);
  if (proxyUri) {
    bootstrap({
      environmentVariableNamespace: '',
    });
  }

  return { method, url, data, options };
};

export const makeStreamRequestToDownstream = (
  req: PostFilterPreparedRequest,
) => {
  const t0 = performance.now();
  const { method, url, data, options } = setupRequest(req);
  const t1 = performance.now();
  logger.debug(
    {},
    `##################################################################\n
         PERFORMANCE setupRequest took ${t1 - t0} milliseconds.\n
         ###################################################`,
  );
  return needle.request(method, url, data, options);
};

export const makeRequestToDownstream = async (
  payload: PostFilterPreparedRequest,
): Promise<{ res: needle.NeedleResponse; body: any }> => {
  const { method, url, data, options } = setupRequest(payload);

  return new Promise((resolve, reject) => {
    needle.request(method, url, data, options, (err, res, respBody) => {
      if (err) {
        return reject(err);
      }
      resolve({ res, body: respBody });
    });
  });
};

export const makeRequest = async (
  payload,
): Promise<{ res: needle.NeedleResponse; body: any }> => {
  const { method, url, data, options } = setupRequest(payload);
  return new Promise((resolve, reject) => {
    needle.request(method, url, data, options, (err, res, respBody) => {
      if (err) {
        return reject(err);
      }
      resolve({ res, body: respBody });
    });
  });
};
