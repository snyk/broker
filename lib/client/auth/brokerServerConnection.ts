import { getConfig } from '../../common/config/config';
import { PostFilterPreparedRequest } from '../../common/relay/prepareRequest';
import version from '../../common/utils/version';
import {
  HttpResponse,
  makeRequestToDownstream,
} from '../../hybrid-sdk/http/request';
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
): Promise<HttpResponse> => {
  const clientConfig = getConfig();
  const apiHostname = clientConfig.apiHostname;
  const body = {
    data: {
      type: 'broker_connection',
      attributes: {
        broker_client_id: brokerServerConnectionParams.brokerClientId,
      },
    },
  };
  const url = new URL(
    `${apiHostname}/hidden/brokers/connections/${brokerServerConnectionParams.connectionIdentifier}/auth/refresh`,
  );
  url.searchParams.append('connection_role', brokerServerConnectionParams.role);
  if (brokerServerConnectionParams.serverId) {
    url.searchParams.append(
      'serverId',
      `${brokerServerConnectionParams.serverId}`,
    );
  }
  const req: PostFilterPreparedRequest = {
    url: url.toString(),
    headers: {
      authorization: brokerServerConnectionParams.authorization,
      'user-agent': `Snyk Broker Client ${version}`,
    },
    method: 'POST',
    body: JSON.stringify(body),
  };
  return await makeRequestToDownstream(req);
};
