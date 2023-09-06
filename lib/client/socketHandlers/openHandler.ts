import { log as logger } from '../../logs/logger';
import { ClientOpts } from '../types/client';

export const openHandler = (io, clientOps: ClientOpts, identifyingMetadata) => {
  const metadata = {
    capabilities: identifyingMetadata.capabilities,
    clientId: identifyingMetadata.clientId,
    preflightChecks: identifyingMetadata.preflightChecks,
    version: identifyingMetadata.version,
  };
  logger.info(
    {
      url: clientOps.config.brokerServerUrl,
      token: clientOps.config.brokerToken,
      metadata,
    },
    'successfully established a websocket connection to the broker server',
  );
  const clientData = {
    token: clientOps.config.brokerToken,
    metadata: identifyingMetadata,
  };
  io.send('identify', clientData);
};
