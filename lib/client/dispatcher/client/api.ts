import { axiosInstance } from './axios';
import logger = require('../../../log');
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
    const path = `/hidden/broker/${params.hashedBrokerToken}/connections/${params.brokerClientId}`;

    const response = await axiosInstance.post<CreateConnectionResponse>(
      path,
      {
        data: {
          attributes: {
            deployment_location: data.deployment_location,
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

    const apiResponse = response?.data?.data;
    const snykRequestId = response.headers['snyk-request-id'] || '';
    logger.trace(
      { snykRequestId, apiResponse },
      'createConnection API response',
    );

    const serverId = response?.data?.data?.attributes?.server_id || '-1';
    return response.status === 201 ? serverId : '-1';
  }
}
