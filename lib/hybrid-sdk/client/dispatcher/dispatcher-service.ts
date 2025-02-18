import { CONFIGURATION } from '../../common/types/options';

export type CreateConnectionRequestData = {
  deployment_location: string;
  broker_token_first_char: string;
};

export type CreateConnectionRequestParams = {
  brokerClientId: string;
  hashedBrokerToken: string;
};

export type CreateConnectionResponse = {
  data?: { attributes?: { server_id: string } };
};

export type ServerId = string;

export interface DispatcherServiceClient {
  createConnection(
    params: CreateConnectionRequestParams,
    data: CreateConnectionRequestData,
    config: CONFIGURATION,
  ): Promise<ServerId>;
}

export async function getServerIdFromDispatcher(
  client: DispatcherServiceClient,
  params: CreateConnectionRequestParams,
  data: CreateConnectionRequestData,
  config: CONFIGURATION,
): Promise<ServerId> {
  return await client.createConnection(params, data, config);
}
