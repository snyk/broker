import { clientDisconnected } from '../infra/dispatcher';
import { addClientIdToTerminationMap } from './identifyHandler';

export const handleTerminationSignalOnSocket = (token, clientId) => {
  addClientIdToTerminationMap(token, clientId);
  setImmediate(async () => await clientDisconnected(token, clientId));
};
