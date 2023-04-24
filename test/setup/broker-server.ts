import * as app from '../../lib';
import { createTestLogger } from '../helpers/logger';
import { choosePort } from './detect-port';
import { DEFAULT_BROKER_SERVER_PORT } from './constants';
import { setTimeout } from 'timers/promises';

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
    : await choosePort(DEFAULT_BROKER_SERVER_PORT);

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

export const waitForBrokerClientConnection = async (
  brokerServer: BrokerServer,
): Promise<{
  brokerToken: string;
  metadata: unknown;
}> => {
  let brokerToken = 'unknown';
  let metadata: unknown;

  await new Promise<{ brokerToken: string; metadata: unknown }>((resolve) => {
    brokerServer.server.io.on('connection', (spark) => {
      LOG.debug(
        {
          spark_id: spark.id,
          spark_headers: spark.headers,
          spark_address: spark.address,
        },
        'on connection event for broker server',
      );

      spark.on('identify', (clientData) => {
        LOG.debug({ clientData }, 'on identify event for broker server');

        brokerToken = clientData?.token;
        metadata = clientData?.metadata;
        resolve({
          brokerToken,
          metadata,
        });
      });
    });
  });

  return { brokerToken, metadata };
};

export const closeBrokerServer = async (
  brokerServer: BrokerServer,
): Promise<void> => {
  await brokerServer.server?.close();
  await setTimeout(100, 'wait 100ms after closing server');
};
