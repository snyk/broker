import { Check } from '../../lib/client/checks/types';
import { Config } from '../../lib/client/config';

export const aCheck = (fields: Partial<Check>): Check => {
  const id = `check_${Date.now()}`;
  return {
    checkId: id,
    checkName: id,
    url: 'http://localhost:8080/check-url',
    active: true,
    timeoutMs: 500,
    ...fields,
  };
};

/**
 * Config with all features disabled.
 */
export const aConfig = (fields: Partial<Config>): Config => {
  return {
    API_BASE_URL: 'http://api:8080',
    BROKER_DISPATCHER_BASE_URL: 'http://dispatcher:8080',
    BROKER_HA_MODE_ENABLED: 'false',
    BROKER_SERVER_URL: 'http://broker-server:8080',
    PREFLIGHT_CHECKS_ENABLED: 'false',
    ...fields,
  };
};
