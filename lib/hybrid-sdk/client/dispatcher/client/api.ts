import { makeRequestToDownstream } from '../../../http/request';
import { log as logger } from '../../../../logs/logger';
import {
  CreateConnectionRequestData,
  CreateConnectionRequestParams,
  DispatcherServiceClient,
  ServerId,
} from '../dispatcher-service';
import { getAuthConfig } from '../../auth/oauth';
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
      const headers = { 'Content-type': 'application/vnd.api+json' };
      const authConfig = getAuthConfig();
      if (authConfig.accessToken && getAuthConfig().accessToken.authHeader) {
        headers['Authorization'] = getAuthConfig().accessToken.authHeader;
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
      const response = await makeRequestToDownstream(req);
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
