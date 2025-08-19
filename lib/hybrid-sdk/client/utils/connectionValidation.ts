import { format, parse } from 'url';
import { makeSingleRawRequestToDownstream } from '../../http/request';
import { ConnectionConfig } from '../types/config';
import { log as logger, sanitise } from '../../../logs/logger';
import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';

export const validateConnection = async (config: ConnectionConfig) => {
  let passing = false;
  const data: Object[] = [];
  for (let i = 0; i < config.validations.length; i++) {
    const validation = config.validations[i] ?? {};
    const method = validation?.method ?? 'GET';
    const { auth, url } = validation;
    const headers: Record<string, string> = validation?.headers ?? {};
    const originalUrl = validation.url;
    const sanitisedOriginalUrl = sanitise(originalUrl);

    switch (auth?.type) {
      case 'basic':
        headers['Authorization'] = `Basic ${Buffer.from(
          `${auth.username}:${auth.password}`,
        ).toString('base64')}`;
        break;
      case 'header':
        headers['Authorization'] = `${auth.value}`;
        break;
      default: {
        const parsed = parse(url);
        if (parsed.auth) {
          if (parsed.auth.includes(':')) {
            headers['Authorization'] = `Basic ${Buffer.from(
              parsed.auth,
            ).toString('base64')}`;
          } else {
            headers['Authorization'] = `Bearer ${parsed.auth}`;
          }
          parsed.auth = null;
          validation.url = format(parsed);
        } else {
          logger.warn({ validation }, 'No auth validation.');
        }
        break;
      }
    }
    const request: PostFilterPreparedRequest = {
      method: method,
      url: validation.url,
      headers: headers,
    };
    if (validation.body) {
      request.body = validation.body;
    }
    try {
      const response = await makeSingleRawRequestToDownstream(
        request as PostFilterPreparedRequest,
      );
      if (response && response.statusCode) {
        passing = response.statusCode >= 200 && response.statusCode < 300;
      }
      data.push({
        url: sanitisedOriginalUrl,
        data: response.body,
        statusCode: response.statusCode,
      });
    } catch (err) {
      data.push({ url: sanitisedOriginalUrl, data: err });
    }
  }
  return { passing, data };
};
