export const metadataWithoutFilters = (metadataWithFilters: {
  capabilities: unknown;
  clientId: unknown;
  preflightChecks: unknown;
  version: unknown;
  clientConfig: unknown;
}) => {
  return {
    capabilities: metadataWithFilters.capabilities,
    clientId: metadataWithFilters.clientId,
    preflightChecks: metadataWithFilters.preflightChecks,
    version: metadataWithFilters.version,
    clientConfig: metadataWithFilters.clientConfig ?? {},
  };
};
