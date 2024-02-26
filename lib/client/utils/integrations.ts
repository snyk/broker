import { getConfig } from '../../common/config/config';

export const translateIntegrationTypeToBrokerIntegrationType = (
  integrationType: string,
): string => {
  const config = getConfig();
  return config.sourceTypes[integrationType].brokerType;
};
