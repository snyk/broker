import * as app from '../../lib';
import { createTestLogger } from '../helpers/logger';
import { choosePort } from './detect-port';
import { DEFAULT_BROKER_SERVER_PORT } from './constants';

const LOG = createTestLogger();

interface CreateBrokerServerOptions {
  filters?: string;
  port?: number;
}

export type BrokerServer = {
  port: number;
  server: any;
};

export const createBrokerServer = async (
  params?: CreateBrokerServerOptions,
): Promise<BrokerServer> => {
  const port = params?.port
    ? await choosePort(params?.port)
    : DEFAULT_BROKER_SERVER_PORT;

  const opts = {
    port: port,
    client: undefined,
    config: {
      accept: params?.filters ? params.filters : undefined,
    },
  };

  const server = await app.main(opts);

  LOG.debug({ port }, `Broker Server is listening on port ${port}...`);

  return Promise.resolve({
    port: port,
    server: server,
  });
};
