import { clientDisconnected } from '../infra/dispatcher';
import { addClientIdToTerminationMap } from './identifyHandler';

export const handleTerminationSignalOnSocket = (
  token: string,
  clientId: string,
) => {
  addClientIdToTerminationMap(token, clientId);
  setImmediate(async () => await clientDisconnected(token, clientId));
};
