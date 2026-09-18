import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net, { AddressInfo, Socket } from 'node:net';
import { TLSSocket } from 'node:tls';

import { uuidv4 } from '../../../../../lib/hybrid-sdk/common/utils/uuid';
import {
  getConfig,
  setConfig,
} from '../../../../../lib/hybrid-sdk/common/config/config';
import { ExtendedLogContext } from '../../../../../lib/hybrid-sdk/common/types/log';

// This suite deliberately exercises the direct topology even on developer or
// CI machines that have proxy environment variables configured.
jest.mock('../../../../../lib/hybrid-sdk/common/utils/proxy', () => ({
  ...jest.requireActual('../../../../../lib/hybrid-sdk/common/utils/proxy'),
  initGlobalProxy: jest.fn(),
}));

// downstream-post-stream-to-server selects http versus https when its module
// is initialized, so establish an HTTPS configuration before requiring it.
setConfig({
  brokerServerUrl: 'https://localhost',
  universalBrokerEnabled: false,
  universalBrokerGa: false,
});
const {
  BrokerServerPostResponseHandler,
} = require('../../../../../lib/hybrid-sdk/http/downstream-post-stream-to-server');

interface CapturedLogCall {
  context: Record<string, any>;
  message: string;
}

class TestLogger {
  errorCalls: CapturedLogCall[] = [];
  warnCalls: CapturedLogCall[] = [];
  debugCalls: CapturedLogCall[] = [];
  context: Record<string, any> = {};

  error(contextOrMessage: Record<string, any> | string, message?: string) {
    this.capture(this.errorCalls, contextOrMessage, message);
  }

  warn(contextOrMessage: Record<string, any> | string, message?: string) {
    this.capture(this.warnCalls, contextOrMessage, message);
  }

  debug(contextOrMessage: Record<string, any> | string, message?: string) {
    this.capture(this.debugCalls, contextOrMessage, message);
  }

  child(additionalContext: Record<string, any>): TestLogger {
    const child = new TestLogger();
    child.context = { ...this.context, ...additionalContext };
    child.errorCalls = this.errorCalls;
    child.warnCalls = this.warnCalls;
    child.debugCalls = this.debugCalls;
    return child;
  }

  private capture(
    calls: CapturedLogCall[],
    contextOrMessage: Record<string, any> | string,
    message?: string,
  ) {
    if (typeof contextOrMessage === 'string') {
      calls.push({ context: { ...this.context }, message: contextOrMessage });
      return;
    }
    calls.push({
      context: { ...this.context, ...contextOrMessage },
      message: message || '',
    });
  }
}

interface RequestOutcome {
  response?: http.IncomingMessage;
  error?: Error & { code?: string };
}

interface CapturedRequest {
  request: http.ClientRequest;
  socket?: TLSSocket;
  outcome: Promise<RequestOutcome>;
}

const certificateDirectory = path.resolve(
  __dirname,
  '../../../../fixtures/certs',
);
const serverKey = fs.readFileSync(
  path.join(certificateDirectory, 'server/privkey.pem'),
);
const serverCertificate = fs.readFileSync(
  path.join(certificateDirectory, 'server/fullchain.pem'),
);
const rootCa = fs.readFileSync(
  path.join(certificateDirectory, 'ca/my-root-ca.crt.pem'),
);

describe('BrokerServerPostResponseHandler', () => {
  const brokerToken = 'test-broker-token';
  const serverId = 123;
  const requestId = 'test-request-id';
  const role = 'primary';

  let testLogger: TestLogger;
  let activeServer: net.Server | undefined;
  let serverPort: number;
  let requestSpy: jest.SpyInstance;
  let capturedRequests: CapturedRequest[];
  const originalAgentCa = https.globalAgent.options.ca;

  beforeAll(() => {
    // NODE_EXTRA_CA_CERTS is the production mechanism. Supplying the same CA
    // on the existing global Agent keeps this test self-contained while still
    // exercising certificate validation and the real global Agent pool.
    https.globalAgent.options.ca = rootCa;
  });

  afterAll(() => {
    https.globalAgent.destroy();
    if (originalAgentCa === undefined) {
      delete https.globalAgent.options.ca;
    } else {
      https.globalAgent.options.ca = originalAgentCa;
    }
  });

  beforeEach(() => {
    testLogger = new TestLogger();
    capturedRequests = [];
    const originalRequest = https.request;
    requestSpy = jest.spyOn(https, 'request').mockImplementation(((
      ...args: any[]
    ) => {
      const request = (originalRequest as any)(...args);
      let resolveOutcome: (outcome: RequestOutcome) => void;
      const captured: CapturedRequest = {
        request,
        outcome: new Promise((resolve) => {
          resolveOutcome = resolve;
        }),
      };
      request.once('socket', (socket) => {
        captured.socket = socket as TLSSocket;
      });
      request.once('response', (response) => {
        response.once('end', () => resolveOutcome({ response }));
        response.once('error', (error) => resolveOutcome({ error }));
      });
      request.once('error', (error) => resolveOutcome({ error }));
      capturedRequests.push(captured);
      return request;
    }) as typeof https.request);
  });

  afterEach(async () => {
    requestSpy.mockRestore();
    https.globalAgent.destroy();
    if (activeServer?.listening) {
      if ('closeAllConnections' in activeServer) {
        (activeServer as https.Server).closeAllConnections();
      }
      await new Promise<void>((resolve, reject) =>
        activeServer!.close((error) => (error ? reject(error) : resolve())),
      );
    }
    activeServer = undefined;
  });

  const createHandler = () =>
    new BrokerServerPostResponseHandler(
      createLogContext(),
      getConfig(),
      brokerToken,
      serverId,
      requestId,
      role,
      testLogger,
    );

  const configureForActiveServer = () => {
    setConfig({
      brokerServerUrl: `https://localhost:${serverPort}`,
      universalBrokerEnabled: false,
      universalBrokerGa: false,
    });
  };

  const startHttpsServer = async (
    requestListener: http.RequestListener,
    observeServer?: (server: https.Server) => void,
  ) => {
    const server = https.createServer(
      { key: serverKey, cert: serverCertificate },
      requestListener,
    );
    observeServer?.(server);
    activeServer = server;
    await listen(server);
    configureForActiveServer();
    return server;
  };

  const sendData = async (streamingId: string) => {
    const requestIndex = capturedRequests.length;
    const freeSocket = waitForFreeSocket();
    await createHandler().sendData(
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { streamingId },
      },
      streamingId,
    );
    const captured = capturedRequests[requestIndex];
    const [outcome, socket] = await Promise.all([captured.outcome, freeSocket]);
    if (outcome.error) throw outcome.error;
    return { captured, response: outcome.response!, socket };
  };

  const waitForFreeSocket = () =>
    new Promise<TLSSocket>((resolve) => {
      const onFree = (socket: Socket) => {
        if (socket.remotePort !== serverPort) return;
        https.globalAgent.off('free', onFree);
        resolve(socket as TLSSocket);
      };
      https.globalAgent.on('free', onFree);
    });

  describe('sendData()', () => {
    describe('HTTPS connection reuse', () => {
      it('reuses one authenticated TLS connection without accumulating listeners', async () => {
        let tcpConnections = 0;
        let tlsConnections = 0;
        const serverRemotePorts: number[] = [];
        const requestConnectionHeaders: Array<string | undefined> = [];
        await startHttpsServer(
          (request, response) => {
            request.resume();
            request.once('end', () => {
              serverRemotePorts.push(request.socket.remotePort!);
              requestConnectionHeaders.push(request.headers.connection);
              response.writeHead(200, { 'content-type': 'application/json' });
              response.write('{"ack":');
              setImmediate(() => response.end('true}'));
            });
          },
          (server) => {
            server.on('connection', () => tcpConnections++);
            server.on('secureConnection', () => tlsConnections++);
          },
        );

        const completed: Array<{
          captured: CapturedRequest;
          response: http.IncomingMessage;
          socket: TLSSocket;
        }> = [];
        const listenerCounts: Array<Record<string, number>> = [];
        for (let cycle = 0; cycle < 20; cycle++) {
          const result = await sendData(`stream-${cycle}`);
          completed.push(result);
          listenerCounts.push({
            lookup: result.socket.listenerCount('lookup'),
            connect: result.socket.listenerCount('connect'),
            secureConnect: result.socket.listenerCount('secureConnect'),
          });
        }

        expect(tcpConnections).toBe(1);
        expect(tlsConnections).toBe(1);
        expect(new Set(serverRemotePorts).size).toBe(1);
        expect(requestConnectionHeaders).toEqual(Array(20).fill('keep-alive'));
        expect(capturedRequests[0].request.reusedSocket).toBe(false);
        expect(
          capturedRequests
            .slice(1)
            .every(({ request }) => request.reusedSocket),
        ).toBe(true);
        expect(
          capturedRequests.every(({ request }) =>
            Object.is(
              (request as http.ClientRequest & { agent: http.Agent }).agent,
              https.globalAgent,
            ),
          ),
        ).toBe(true);
        expect(
          completed.every(({ socket }) => socket === completed[0].socket),
        ).toBe(true);
        expect(
          new Set(listenerCounts.map((counts) => JSON.stringify(counts))).size,
        ).toBe(1);
        expect(listenerCounts[0]).toEqual({
          lookup: 0,
          connect: 0,
          secureConnect: 0,
        });
        expect(
          countLogs('Completed DNS lookup for POST to Broker Server'),
        ).toBe(1);
        expect(
          countLogs(
            'Established TCP connection details for POST to Broker Server',
          ),
        ).toBe(1);
        expect(
          countLogs('Established new TLS session for POST to Broker Server'),
        ).toBe(1);
        expect(
          countLogs('Reusing existing TLS session for POST to Broker Server'),
        ).toBe(0);
        expect(
          completed.every(
            ({ response }) =>
              response.complete &&
              response.readableEnded &&
              response.readableLength === 0,
          ),
        ).toBe(true);
        expect(matchingAgentSockets(https.globalAgent.sockets)).toHaveLength(0);
        expect(matchingAgentSockets(https.globalAgent.freeSockets)).toEqual([
          completed[0].socket,
        ]);
      });
    });
  });

  function countLogs(message: string) {
    return testLogger.debugCalls.filter((call) => call.message === message)
      .length;
  }

  function matchingAgentSockets(sockets: NodeJS.Dict<Socket[]>): Socket[] {
    return Object.values(sockets)
      .flatMap((entries) => entries || [])
      .filter((socket) => socket.remotePort === serverPort);
  }

  async function listen(server: net.Server) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, 'localhost', () => {
        server.off('error', reject);
        serverPort = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  }
});

function createLogContext(): ExtendedLogContext {
  return {
    url: '',
    requestMethod: 'POST',
    requestId: 'test-request-id',
    maskedToken: 'test-masked-token',
    hashedToken: 'test-hashed-token',
    actingOrgPublicId: uuidv4(),
    actingGroupPublicId: uuidv4(),
    productLine: 'test-product',
    flow: 'test-flow',
  };
}
