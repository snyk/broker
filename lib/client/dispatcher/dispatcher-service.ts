export type CreateConnectionRequestData = {
  deployment_location: string;
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
  ): Promise<ServerId>;
}

export async function getServerIdFromDispatcher(
  client: DispatcherServiceClient,
  params: CreateConnectionRequestParams,
): Promise<ServerId> {
  return await client.createConnection(params, {
    deployment_location: 'snyk-broker-client',
  });
}
