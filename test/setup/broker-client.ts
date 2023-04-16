import * as app from '../../lib';
import { createTestLogger } from '../helpers/logger';
import { choosePort } from './detect-port';
import { DEFAULT_BROKER_CLIENT_PORT } from './constants';

const LOG = createTestLogger();

interface CreateBrokerClientOptions {
  brokerToken: string;
  brokerServerUrl: string;
  enablePreflightChecks?: string;
  enableHighAvailabilityMode?: string;
  filters?: string;
  port?: number;
}

export type BrokerClient = {
  port: number;
  client: any;
};

export const createBrokerClient = async (
  params: CreateBrokerClientOptions,
): Promise<BrokerClient> => {
  const port = params?.port
    ? await choosePort(params?.port)
    : DEFAULT_BROKER_CLIENT_PORT;

  const opts = {
    port: port,
    client: 'client',
    config: {
      accept: params.filters ? params.filters : undefined,
      brokerServerUrl: params.brokerServerUrl,
      brokerToken: params.brokerToken,
      BROKER_TOKEN: params.brokerToken,
      BROKER_HA_MODE_ENABLED: params.enableHighAvailabilityMode
        ? params.enableHighAvailabilityMode
        : 'false',
      PREFLIGHT_CHECKS_ENABLED: params.enablePreflightChecks
        ? params.enablePreflightChecks
        : 'false',
    },
  };

  const client = await app.main(opts);

  LOG.debug({ port }, `Broker Client is listening on port ${port}...`);

  return Promise.resolve({
    port: port,
    client: client,
  });
};
