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
    switch (auth?.type) {
      case 'basic':
        headers['Authorization'] = `Basic ${Buffer.from(
          `${auth.username}:${auth.password}`,
        ).toString('base64')}`;
        break;
      case 'header':
        headers['Authorization'] = `${auth.value}`;
        break;
      default:
        logger.warn({ validation }, 'No auth validation.');
    }
    const request: PostFilterPreparedRequest = {
      method: method,
      url: url,
      headers: headers,
    };
    if (validation.body) {
      request.body = validation.body;
    }
    // make sure that credentials in url are sanitised
    const sanitisedUrl = sanitise(url);
    try {
      const response = await makeSingleRawRequestToDownstream(
        request as PostFilterPreparedRequest,
      );
      if (response && response.statusCode) {
        passing = response.statusCode >= 200 && response.statusCode < 300;
      }
      data.push({
        url: sanitisedUrl,
        data: response.body,
        statusCode: response.statusCode,
      });
    } catch (err) {
      data.push({ url: sanitisedUrl, data: err });
    }
  }
  return { passing, data };
};
