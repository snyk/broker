import { makeSingleRawRequestToDownstream } from '../../http/request';
import { ConnectionConfig } from '../types/config';
import { log as logger } from '../../../logs/logger';
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
    try {
      const response = await makeSingleRawRequestToDownstream(
        request as PostFilterPreparedRequest,
      );
      if (response && response.statusCode) {
        passing = response.statusCode > 200 && response.statusCode < 300;
      }
      data.push({
        url: url,
        data: response.body,
        statusCode: response.statusCode,
      });
    } catch (err) {
      data.push({ url: url, data: err });
    }
  }
  return { passing, data };
};
