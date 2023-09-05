import { axiosInstance } from '../../../common/http/axios';
import { log as logger } from '../../../logs/logger';
import {
  CreateConnectionRequestData,
  CreateConnectionRequestParams,
  CreateConnectionResponse,
  DispatcherServiceClient,
  ServerId,
} from '../dispatcher-service';

export class HttpDispatcherServiceClient implements DispatcherServiceClient {
  private readonly version = '2022-12-01~experimental';
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async createConnection(
    params: CreateConnectionRequestParams,
    data: CreateConnectionRequestData,
  ): Promise<ServerId> {
    try {
      const path = `/hidden/broker/${params.hashedBrokerToken}/connections/${params.brokerClientId}`;

      const response = await axiosInstance.post<CreateConnectionResponse>(
        path,
        {
          data: {
            attributes: {
              deployment_location: data.deployment_location,
              broker_token_first_char: data.broker_token_first_char,
            },
          },
        },
        {
          baseURL: this.baseUrl,
          headers: {
            'Content-type': 'application/vnd.api+json',
          },
          params: { version: this.version },
          validateStatus: () => true,
        },
      );

      const apiResponse = response.data.data;
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
