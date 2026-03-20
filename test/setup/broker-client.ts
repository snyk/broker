import nock from 'nock';
import { app } from '../../lib';
import { createTestLogger } from '../helpers/logger';
import { choosePort } from './detect-port';
import { DEFAULT_BROKER_CLIENT_PORT } from './constants';
// import { setTimeout } from 'timers/promises';

const LOG = createTestLogger();

interface CreateBrokerClientOptions {
  brokerClientValidationUrl?: string;
  brokerClientValidationBasicAuth?: string;
  brokerClientValidationBasicAuthPool?: Array<string>;
  brokerClientValidationAuthorizationHeader?: string;
  brokerHealthcheckPath?: string;
  brokerServerUrl: string;
  brokerSystemcheckPath?: string;
  brokerToken: string;
  enablePreflightChecks?: string;
  enableHighAvailabilityMode?: string;
  filters?: string;
  passwordPool?: Array<string>;
  port?: number;
  type?: string;
  universalBrokerEnabled?: string;
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
    : await choosePort(DEFAULT_BROKER_CLIENT_PORT);

  const opts = {
    port: port,
    client: 'client',
    config: {
      accept: params.filters ? params.filters : undefined,
      brokerServerUrl: params.brokerServerUrl,
      brokerToken: params.brokerToken,
      brokerClientValidationUrl: params.brokerClientValidationUrl
        ? params.brokerClientValidationUrl
        : undefined,
      brokerClientValidationBasicAuth: params.brokerClientValidationBasicAuth
        ? params.brokerClientValidationBasicAuth
        : undefined,
      brokerClientValidationBasicAuthPool:
        params.brokerClientValidationBasicAuthPool
          ? params.brokerClientValidationBasicAuthPool
          : undefined,
      brokerClientValidationAuthorizationHeader:
        params.brokerClientValidationAuthorizationHeader
          ? params.brokerClientValidationAuthorizationHeader
          : undefined,
      brokerHealthcheckPath: params.brokerHealthcheckPath
        ? params.brokerHealthcheckPath
        : undefined,
      brokerSystemcheckPath: params.brokerSystemcheckPath
        ? params.brokerSystemcheckPath
        : undefined,
      BROKER_TOKEN: params.brokerToken,
      PREFLIGHT_CHECKS_ENABLED: params.enablePreflightChecks
        ? params.enablePreflightChecks
        : 'false',
      PASSWORD_POOL: params.passwordPool
        ? params.passwordPool.join(',')
        : undefined,
      BROKER_TYPE: params.type ? params.type : undefined,
      removeXForwardedHeaders: 'true',
      universalBrokerEnabled: params.universalBrokerEnabled ?? false,
      API_BASE_URL: process.env.API_BASE_URL ?? params.brokerServerUrl,
    },
  };

  // getServerId is called during startup for non-universal broker clients.
  // In tests there is no real dispatcher service, so intercept that call.
  const apiBaseUrl = opts.config.API_BASE_URL as string;
  nock(new URL(apiBaseUrl).origin)
    .post(/\/hidden\/broker\/[^/]+\/connections\/[^/]+/)
    .query(true)
    .reply(200, { data: { attributes: { server_id: 'test-server-1' } } });

  const client = await app({ port: port, client: true, config: opts.config });

  // Remove nock interceptors so they don't interfere with subsequent HTTP connections
  // (e.g. WebSocket polling requests to the broker server).
  nock.cleanAll();

  LOG.debug({ port }, `Broker Client is listening on port ${port}...`);

  return Promise.resolve({
    port: port,
    client: client,
  });
};

export const waitForBrokerServerConnection = async (
  brokerClient: BrokerClient,
): Promise<unknown> => {
  const websocket = brokerClient.client.websocketConnections[0];

  // If the server already sent 'identify' (capabilities are set by identifyHandler),
  // return immediately rather than waiting for an event that has already fired.
  if (websocket.capabilities) {
    return { capabilities: websocket.capabilities };
  }

  let serverMetadata: unknown;

  await new Promise((resolve) => {
    websocket.on('identify', (serverData) => {
      LOG.debug({ serverData }, 'on identify event for broker client');

      serverMetadata = serverData;
      resolve(serverData);
    });
  });

  return Promise.resolve(serverMetadata);
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ConnectionDetails {
  brokertoken: string;
  capabilities: Array<string>;
  index: number;
}

export const waitForBrokerServerConnections = async (
  brokerClient: BrokerClient,
): Promise<Array<ConnectionDetails>> => {
  let capabilities = brokerClient.client.websocketConnections.map(
    (x, index) => {
      return {
        index: index,
        capabilities: x.capabilities,
        brokertoken: x.identifier,
      };
    },
  );
  let remainingConnectionsToWaitFor = capabilities
    .filter((x) => !x.capabilities)
    .map((x) => x.index);
  do {
    capabilities = brokerClient.client.websocketConnections.map((x, index) => {
      return {
        index: index,
        capabilities: x.capabilities,
        brokertoken: x.identifier,
      };
    });
    remainingConnectionsToWaitFor = capabilities
      .filter((x) => !x.capabilities)
      .map((x) => x.index);
    console.log('waiting for all connections...');

    await sleep(200);
  } while (remainingConnectionsToWaitFor.length > 0);

  return Promise.resolve(capabilities);
};

export const closeBrokerClient = async (
  brokerClient: BrokerClient,
): Promise<void> => {
  await brokerClient.client?.close();
  await sleep(200);
};
