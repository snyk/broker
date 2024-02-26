import { makeSingleRawRequestToDownstream } from '../../common/http/request';
import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';
import version from '../../common/utils/version';
import { ConnectionConfig } from '../types/config';
import { log as logger } from '../../logs/logger';
export const validateConnection = async (config: ConnectionConfig) => {
  let passing = false;
  const data: Object[] = [];
  for (let i = 0; i < config.validations.length; i++) {
    const validation = config.validations[i] ?? {};
    const method = validation?.method ?? 'GET';
    const { auth, url } = validation;
    const headers: Record<string, string> = {};
    headers['user-agent'] = `Snyk Broker client ${version}`;
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
        logger.warn({ validation }, 'No auth validation');
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
        passing =
          response.statusCode < 300 && response.statusCode > 200 ? true : false;
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
