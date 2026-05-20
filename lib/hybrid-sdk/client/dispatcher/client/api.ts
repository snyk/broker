import { makeRequestToDownstream } from '../../../http/request';
import { log as logger } from '../../../../logs/logger';
import {
  CreateConnectionRequestData,
  CreateConnectionRequestParams,
  DispatcherServiceClient,
  ServerId,
} from '../dispatcher-service';
import {
  getAccessToken,
  invalidateToken,
  isOAuthClientInitialized,
} from '../../auth/oauth';
import { PostFilterPreparedRequest } from '../../../../broker-workload/prepareRequest';

export class HttpDispatcherServiceClient implements DispatcherServiceClient {
  private readonly version = '2022-12-01~experimental';
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async createConnection(
    params: CreateConnectionRequestParams,
    data: CreateConnectionRequestData,
    config,
  ): Promise<ServerId> {
    try {
      const path = `${config.DISPATCHER_URL_PREFIX}/${params.hashedBrokerToken}/connections/${params.brokerClientId}`;
      const url = new URL(path, this.baseUrl);
      url.searchParams.append('version', this.version);
      const headers: Record<string, string> = {
        'Content-type': 'application/vnd.api+json',
      };
      if (isOAuthClientInitialized()) {
        headers['Authorization'] = await getAccessToken();
      }
      const req: PostFilterPreparedRequest = {
        url: url.toString(),
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: {
            attributes: {
              deployment_location: data.deployment_location,
              broker_token_first_char: data.broker_token_first_char,
            },
          },
        }),
      };
      let response = await makeRequestToDownstream(req);
      if (response.statusCode === 401 && isOAuthClientInitialized()) {
        logger.debug(
          {},
          'Dispatcher createConnection returned 401; invalidating cached token and retrying once.',
        );
        invalidateToken();
        req.headers['Authorization'] = await getAccessToken();
        response = await makeRequestToDownstream(req);
      }
      const apiResponse = JSON.parse(response.body).data;
      if (!apiResponse?.attributes) {
        logger.trace(
          { apiResponse },
          'Unexpected Connection Allocation Server response',
        );
        throw new Error(
          `Unexpected connection allocation server response - ${response.statusCode}: ${response.body}`,
        );
      }
      const snykRequestId = response.headers['snyk-request-id'] || '';
      logger.trace(
        { snykRequestId, apiResponse },
        'createConnection API response',
      );

      const serverId = apiResponse.attributes.server_id;
      return serverId;
    } catch (err) {
      logger.trace({ err }, 'Error getting connection allocation.');
      throw new Error(`Error getting connection allocation. ${err}`);
    }
  }
}
