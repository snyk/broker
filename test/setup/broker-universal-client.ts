import { app } from '../../lib';
import { createTestLogger } from '../helpers/logger';
import { choosePort } from './detect-port';
import { DEFAULT_BROKER_CLIENT_PORT } from './constants';
import { setTimeout } from 'timers/promises';

const LOG = createTestLogger();

interface CreateUniversalBrokerClientOptions {
  port?: number;
}

export type BrokerClient = {
  port: number;
  client: any;
};

export const createUniversalBrokerClient = async (
  params?: CreateUniversalBrokerClientOptions,
): Promise<BrokerClient> => {
  const port = params?.port
    ? await choosePort(params?.port)
    : await choosePort(DEFAULT_BROKER_CLIENT_PORT);
  const opts = {
    port: port,
    client: 'client',
    config: {
      serviceEnv: 'universaltest',
    },
  };

  const client = await app({ port: port, client: true, config: opts.config });

  LOG.debug({ port }, `Broker Client is listening on port ${port}...`);

  return Promise.resolve({
    port: port,
    client: client,
  });
};

export const waitForBrokerServerConnection = async (
  brokerClient: BrokerClient,
): Promise<unknown> => {
  let serverMetadata: unknown;

  await new Promise((resolve) => {
    brokerClient.client.websocketConnections[0].on('identify', (serverData) => {
      LOG.debug({ serverData }, 'on identify event for broker client');

      serverMetadata = serverData;
      resolve(serverData);
    });
  });

  return Promise.resolve(serverMetadata);
};

export const closeBrokerClient = async (
  brokerClient: BrokerClient,
): Promise<void> => {
  await brokerClient.client?.close();
  await setTimeout(100, 'wait 100ms after closing client');
};
