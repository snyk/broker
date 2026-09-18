import {
  ClientRequest,
  IncomingMessage,
  request as httpRequest,
  Server as HttpServer,
} from 'node:http';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import Primus from 'primus';
import Emitter from 'primus-emitter';

import { pendingResponseRegistry } from '../../../../../lib/hybrid-sdk/http/server-post-stream-handler';
import { getSocketConnections } from '../../../../../lib/hybrid-sdk/server/socket';
import {
  BrokerServer,
  createBrokerServer,
} from '../../../../setup/broker-server';

type RegistryState = {
  activeClaims: Map<string, { destination: PassThrough }>;
  store: { get: (streamingID: string) => { response: PassThrough } };
};

const serverAccept = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'fixtures',
  'server',
  'filters.json',
);

const eventually = async (predicate: () => boolean, timeoutMs = 4_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('condition timed out');
    }
    await delay(10);
  }
};

const withTimeout = async (promise: Promise<void>, timeoutMs = 4_000) => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('server close callback timed out')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const removeAddedSignalListeners = (
  signal: 'SIGINT' | 'SIGTERM',
  before: Function[],
) => {
  for (const listener of process.listeners(signal)) {
    if (!before.includes(listener)) {
      process.removeListener(signal, listener);
    }
  }
};

const closeServer = (brokerServer: BrokerServer): Promise<void> =>
  new Promise((resolve) => {
    const returnValue = brokerServer.server.close(resolve);
    expect(returnValue).toBeUndefined();
  });

describe('hybrid-sdk/server', () => {
  describe('shutdown', () => {
    const runProgrammaticCloseScenario = async (active: boolean) => {
      const sigintBefore = process.listeners('SIGINT');
      const sigtermBefore = process.listeners('SIGTERM');
      const brokerServer = await createBrokerServer({ filters: serverAccept });
      const token = active ? 'active-token' : 'pending-token';
      const Socket = Primus.createSocket({
        transformer: 'engine.io',
        parser: 'EJSON',
        plugin: { emitter: Emitter },
        pathname: `/primus/${token}`,
      });
      const client: any = new Socket(`http://127.0.0.1:${brokerServer.port}`, {
        reconnect: { retries: 0 },
      });
      let requester: ClientRequest | undefined;
      let streamingID: string | undefined;
      let closed = false;

      try {
        client.on('error', () => undefined);
        client.on('identify', () =>
          client.send('identify', {
            token,
            metadata: { version: '4.137.0', capabilities: ['post-streams'] },
          }),
        );
        client.on('request', (payload) => {
          streamingID = payload.streamingID;
          if (active) {
            client.send('chunk', streamingID, 'partial', false, {
              status: 206,
              headers: { 'content-type': 'text/plain' },
            });
          }
        });
        await eventually(() => client.readyState === 3);
        await eventually(() =>
          Boolean(
            getSocketConnections()
              .get(token)
              ?.some((connection) => connection.socket && connection.metadata),
          ),
        );

        const activeRequester: ClientRequest = require('node:http').get(
          `http://127.0.0.1:${brokerServer.port}/broker/${token}/test-blob/file`,
        );
        requester = activeRequester;
        activeRequester.on('error', () => undefined);
        activeRequester.on('response', (response: IncomingMessage) => {
          response.on('error', () => undefined);
          response.resume();
        });
        await eventually(() => Boolean(streamingID));

        const registry = pendingResponseRegistry as unknown as RegistryState;
        await eventually(() =>
          active
            ? registry.activeClaims.has(streamingID!)
            : Boolean(registry.store.get(streamingID!)),
        );
        const response = active
          ? registry.activeClaims.get(streamingID!)?.destination
          : registry.store.get(streamingID!).response;
        if (!response) {
          throw new Error('expected registered response');
        }

        const closeCallback = closeServer(brokerServer).then(() => {
          closed = true;
        });
        await withTimeout(closeCallback);

        expect(response.destroyed).toBe(true);
        expect(registry.store.get(streamingID!)).toBeUndefined();
        expect(registry.activeClaims.has(streamingID!)).toBe(false);
        expect(pendingResponseRegistry.claim(streamingID!)).toEqual({
          status: 'not-found',
        });
      } finally {
        requester?.destroy();
        client.end();
        if (!closed) {
          pendingResponseRegistry.cancelAll();
          await withTimeout(closeServer(brokerServer));
        }
        removeAddedSignalListeners('SIGINT', sigintBefore);
        removeAddedSignalListeners('SIGTERM', sigtermBefore);
      }
    };

    it('settles a pending response before programmatic close completes', async () => {
      await runProgrammaticCloseScenario(false);
    });

    it('settles an active response before programmatic close completes', async () => {
      await runProgrammaticCloseScenario(true);
    });

    it('settles Broker responses and exits while an unrelated HTTP request remains active', async () => {
      const sigintBefore = process.listeners('SIGINT');
      const sigtermBefore = process.listeners('SIGTERM');
      const brokerServer = await createBrokerServer({ filters: serverAccept });
      const pendingResponse = Object.assign(new PassThrough(), {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      });
      const activeResponse = Object.assign(new PassThrough(), {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      });
      pendingResponse.on('error', () => undefined);
      activeResponse.on('error', () => undefined);
      pendingResponse.resume();
      activeResponse.resume();
      pendingResponseRegistry.register('signal-pending-stream', {
        response: pendingResponse as any,
        brokerAppClientId: null,
      });
      pendingResponseRegistry.register('signal-active-stream', {
        response: activeResponse as any,
        brokerAppClientId: null,
      });
      const activeClaim = pendingResponseRegistry.claim('signal-active-stream');
      if (activeClaim.status !== 'claimed') {
        throw new Error('expected active signal response claim');
      }

      const unrelatedPath = '/broker/unrelated-token/ordinary-request';
      const httpServer = brokerServer.server.websocket.server as HttpServer;
      let httpServerClosed = false;
      httpServer.once('close', () => {
        httpServerClosed = true;
      });
      const requestReachedServer = new Promise<void>((resolve) => {
        const onRequest = (request: IncomingMessage) => {
          if (request.url === unrelatedPath) {
            httpServer.removeListener('request', onRequest);
            resolve();
          }
        };
        httpServer.on('request', onRequest);
      });
      const unrelatedRequest = httpRequest({
        hostname: '127.0.0.1',
        port: brokerServer.port,
        path: unrelatedPath,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '1024',
        },
      });
      unrelatedRequest.on('error', () => undefined);
      unrelatedRequest.write('{"incomplete":');
      await withTimeout(requestReachedServer);

      const cancelAll = jest.spyOn(pendingResponseRegistry, 'cancelAll');
      let stateAtExit:
        | {
            activeRequestOpen: boolean;
            activeResponseDestroyed: boolean;
            httpServerClosed: boolean;
            pendingResponseDestroyed: boolean;
            registryCancelAllCalls: number;
          }
        | undefined;
      const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
        stateAtExit = {
          activeRequestOpen: !unrelatedRequest.destroyed,
          activeResponseDestroyed: activeResponse.destroyed,
          httpServerClosed,
          pendingResponseDestroyed: pendingResponse.destroyed,
          registryCancelAllCalls: cancelAll.mock.calls.length,
        };
        return undefined as never;
      }) as typeof process.exit);
      let gracefulClose: Promise<void> | undefined;
      let gracefulCloseCompleted = false;

      try {
        const onSignal = process
          .listeners('SIGTERM')
          .find((listener) => !sigtermBefore.includes(listener));
        if (!onSignal) {
          throw new Error('expected Server SIGTERM listener');
        }

        await onSignal('SIGTERM');
        await eventually(() => exit.mock.calls.length === 1);

        expect(stateAtExit).toEqual({
          activeRequestOpen: true,
          activeResponseDestroyed: true,
          httpServerClosed: false,
          pendingResponseDestroyed: true,
          registryCancelAllCalls: 1,
        });
        expect(pendingResponseRegistry.claim('signal-pending-stream')).toEqual({
          status: 'not-found',
        });
        expect(pendingResponseRegistry.claim('signal-active-stream')).toEqual({
          status: 'not-found',
        });
        expect(activeClaim.pending.complete(1)).toBe(false);

        gracefulClose = closeServer(brokerServer).then(() => {
          gracefulCloseCompleted = true;
        });
        await delay(50);

        expect(gracefulCloseCompleted).toBe(false);
        expect(httpServerClosed).toBe(false);
        expect(unrelatedRequest.destroyed).toBe(false);
      } finally {
        exit.mockRestore();
        cancelAll.mockRestore();
        unrelatedRequest.destroy();
        pendingResponseRegistry.cancelAll();
        await withTimeout(gracefulClose ?? closeServer(brokerServer));
        removeAddedSignalListeners('SIGINT', sigintBefore);
        removeAddedSignalListeners('SIGTERM', sigtermBefore);
      }
    });
  });
});
