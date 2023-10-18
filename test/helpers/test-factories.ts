import { CheckResult, HttpCheck } from '../../lib/client/checks/types';
import { Config } from '../../lib/client/types/config';
import { executeHttpRequest } from '../../lib/client/checks/http/http-executor';

export const aHttpCheck = (fields: Partial<HttpCheck>): HttpCheck => {
  const id = `check_${Date.now()}`;
  return {
    id: id,
    name: id,
    enabled: true,

    url: 'http://broker-server:8080',
    method: 'GET',
    timeoutMs: 100,
    check: async function (): Promise<CheckResult> {
      return await executeHttpRequest(
        { id: this.id, name: this.name },
        { url: this.url, method: this.method, timeoutMs: this.timeoutMs },
      );
    },
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
    GIT_COMMITTER_NAME: '',
    GIT_COMMITTER_EMAIL: '',
    GPG_PASSPHRASE: '',
    GPG_PRIVATE_KEY: '',
    INSECURE_DOWNSTREAM: 'false',
    ...fields,
  };
};
