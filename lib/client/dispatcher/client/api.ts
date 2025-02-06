import { makeRequestToDownstream } from '../../../hybrid-sdk/http/request';
import { PostFilterPreparedRequest } from '../../../common/relay/prepareRequest';
import { log as logger } from '../../../logs/logger';
import {
  CreateConnectionRequestData,
  CreateConnectionRequestParams,
  DispatcherServiceClient,
  ServerId,
} from '../dispatcher-service';
import { getClientOpts } from '../../config/configHelpers';

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
      if (getClientOpts().accessToken) {
        headers['Authorization'] = getClientOpts().accessToken?.authHeader;
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
        throw new Error('Unexpected connection allocation server response');
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
      throw new Error('Error getting connection allocation.');
    }
  }
}
