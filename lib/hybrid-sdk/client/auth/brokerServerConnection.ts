import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { CONFIGURATION } from '../../common/types/options';
import { HttpResponse, makeRequestToDownstream } from '../../http/request';
import { addServerIdAndRoleQS } from '../../http/utils';
import { Role } from '../types/client';

export interface BrokerServerConnectionParams {
  connectionIdentifier: string;
  brokerClientId: string;
  authorization: string;
  role: Role;
  serverId: number;
}
export const renewBrokerServerConnection = async (
  brokerServerConnectionParams: BrokerServerConnectionParams,
  clientConfig: CONFIGURATION,
): Promise<HttpResponse> => {
  const apiHostname = clientConfig.API_BASE_URL;
  const body = {
    data: {
      type: 'broker_connection',
      attributes: {
        broker_client_id: brokerServerConnectionParams.brokerClientId,
      },
    },
  };
  let url = new URL(
    `${apiHostname}/hidden/brokers/connections/${brokerServerConnectionParams.connectionIdentifier}/auth/refresh`,
  );
  url = addServerIdAndRoleQS(
    url,
    brokerServerConnectionParams.serverId,
    brokerServerConnectionParams.role,
  );

  const req: PostFilterPreparedRequest = {
    url: url.toString(),
    headers: {
      Authorization: brokerServerConnectionParams.authorization,
      'Content-type': 'application/vnd.api+json',
    },
    method: 'POST',
    body: JSON.stringify(body),
  };
  return await makeRequestToDownstream(req);
};
