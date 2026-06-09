import { IdentifyingMetadata } from '../../client/types/client';

export const metadataWithoutFilters = (
  metadataWithFilters: IdentifyingMetadata,
) => {
  return {
    capabilities: metadataWithFilters.capabilities,
    clientId: metadataWithFilters.clientId,
    preflightChecks: metadataWithFilters.preflightChecks,
    version: metadataWithFilters.version,
    clientConfig: metadataWithFilters.clientConfig ?? {},
    deploymentId: metadataWithFilters.deploymentId,
  };
};
