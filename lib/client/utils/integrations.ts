export const translateIntegrationTypeToBrokerIntegrationType = (
  integrationType: string,
  config: Record<string, any>,
): string => {
  return config.sourceTypes[integrationType].brokerType;
};
