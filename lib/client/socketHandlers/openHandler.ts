import { LoadedClientOpts } from '../../common/types/options';
import { hashToken } from '../../common/utils/token';
import { log as logger } from '../../logs/logger';
import { IdentifyingMetadata } from '../types/client';

export const openHandler = (
  io,
  clientOps: LoadedClientOpts,
  identifyingMetadata: IdentifyingMetadata,
) => {
  const metadata = {
    capabilities: identifyingMetadata.capabilities,
    clientId: identifyingMetadata.clientId,
    identifier: identifyingMetadata.identifier
      ? hashToken(identifyingMetadata.identifier)
      : '****',
    preflightChecks: identifyingMetadata.preflightChecks,
    version: identifyingMetadata.version,
    clientConfig: identifyingMetadata.clientConfig,
    filters: identifyingMetadata.filters ?? {},
    role: identifyingMetadata.role,
  };
  if (clientOps.config.universalBrokerEnabled) {
    metadata['supportedIntegrationType'] =
      identifyingMetadata.supportedIntegrationType;
  }
  logger.info(
    {
      url: clientOps.config.brokerServerUrl,
      serverId: identifyingMetadata.serverId ?? clientOps.config.serverId ?? '',
      token: clientOps.config.universalBrokerEnabled
        ? identifyingMetadata.identifier
        : clientOps.config.brokerToken,
      // metadata,
    },
    'successfully established a websocket connection to the broker server',
  );
  logger.debug(
    {
      metadata,
    },
    'Loaded rules',
  );
  const clientData = {
    token: clientOps.config.universalBrokerEnabled
      ? identifyingMetadata.identifier
      : clientOps.config.brokerToken,
    metadata: metadata,
  };
  io.send('identify', clientData);
};
