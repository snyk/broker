import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import {
  BrokerClient,
  closeBrokerClient,
  createBrokerClient,
} from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForBrokerClientConnections,
} from '../setup/broker-server';
import { choosePort } from '../setup/detect-port';
import { setConfig } from '../../lib/hybrid-sdk/common/config/config.js';

// Deadline to inject into the broker server — small enough to fire well inside
// the 20s Jest timeout, large enough not to flake under normal load.
const RESPONSE_DATA_TIMEOUT_MS = 500;

// Maximum wall-clock time we allow for the originating request to resolve
// once the deadline has been injected.  Must be > RESPONSE_DATA_TIMEOUT_MS
// but << 20 s so the test is meaningfully bounded.
const MAX_ELAPSED_MS = 5_000;

/**
 * A downstream HTTP server that sends response headers then deliberately hangs
 * (never ends the body).  This stalls the broker client's response-data
 * pipeline so the server-side deadline fires.
 *
 * stopGracefully() destroys all open sockets and closes the server.
 */
function createHangingServer(): {
  server: http.Server;
  stopGracefully: () => Promise<void>;
} {
  const openSockets = new Set<net.Socket>();

  const server = http.createServer((_req, res) => {
    // Send headers and hang — never call res.end().
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'transfer-encoding': 'chunked',
    });
    res.flushHeaders();
  });

  server.on('connection', (socket) => {
    openSockets.add(socket);
    socket.once('close', () => openSockets.delete(socket));
  });

  const stopGracefully = (): Promise<void> => {
    for (const socket of openSockets) {
      socket.destroy();
    }
    openSockets.clear();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { server, stopGracefully };
}

describe('response-data deadline backstop — originating request fails fast', () => {
  let hangingServer: http.Server;
  let stopHangingServer: () => Promise<void>;
  let hangingServerPort: number;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'broker-deadline-test-'));
    // ── 1. Hanging downstream server
    const hanging = createHangingServer();
    hangingServer = hanging.server;
    stopHangingServer = hanging.stopGracefully;

    hangingServerPort = await choosePort(28000);
    await new Promise<void>((resolve) =>
      hangingServer.listen(hangingServerPort, resolve),
    );

    // ── 2. Custom filter files pointing at the hanging downstream.
    //
    //    server filters: allow GET /hang through the Broker Server.
    //    client filters: tell the Broker Client to forward /hang to our
    //                    hanging downstream.
    const serverFiltersPath = path.join(tmpDir, 'server-filters.json');
    const clientFiltersPath = path.join(tmpDir, 'client-filters.json');

    fs.writeFileSync(
      serverFiltersPath,
      JSON.stringify({
        private: [],
        public: [{ path: '/hang', method: 'GET' }],
      }),
    );
    fs.writeFileSync(
      clientFiltersPath,
      JSON.stringify({
        private: [
          {
            path: '/hang',
            method: 'GET',
            origin: `http://localhost:${hangingServerPort}`,
          },
        ],
        public: [{ path: '/hang', method: 'GET' }],
      }),
    );

    // ── 3. Broker Server with a very short response-data deadline.
    //       RESPONSE_DATA_TIMEOUT_MS is picked up by loadBrokerConfig() from
    //       process.env and camelcased to responseDataTimeoutMs.
    process.env.RESPONSE_DATA_TIMEOUT_MS = String(RESPONSE_DATA_TIMEOUT_MS);
    // Reset the module-level config cache so that loadBrokerConfig() (called
    // inside app() / createBrokerServer) reads a fresh config that includes
    // RESPONSE_DATA_TIMEOUT_MS.  Without this, a prior suite in the serial
    // test run may have populated the cache before this env var was set,
    // causing the deadline to be absent and the test to hang.
    setConfig({});
    bs = await createBrokerServer({
      filters: serverFiltersPath,
    });
    // Set BROKER_SERVER_URL to the ACTUAL port chosen (detect-port may have
    // shifted it away from the requested port).
    process.env.BROKER_SERVER_URL = `http://localhost:${bs.port}`;

    // ── 4. Broker Client pointed at our hanging downstream.
    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-deadline-test',
      filters: clientFiltersPath,
      type: 'client',
    });

    // Classic broker opens 2 WebSocket connections (primary + secondary).
    const connData = await waitForBrokerClientConnections(bs, 2);
    const primaryIndex =
      connData.metadataArray[0]['role'] === 'primary' ? 0 : 1;
    brokerToken = connData.brokerTokens[primaryIndex];
  }, 30_000 /* give the full startup chain up to 30 s */);

  afterAll(async () => {
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
    await stopHangingServer();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.BROKER_SERVER_URL;
    delete process.env.RESPONSE_DATA_TIMEOUT_MS;
    // Clear the config cache so subsequent suites start with a clean slate.
    setConfig({});
  }, 30_000);

  it(
    'fails the originating request once the response-data deadline elapses (not hung)',
    async () => {
      // Issue a GET through the Broker Server gateway.  The downstream never
      // finishes its response body, so the broker client's response-data POST
      // to the broker server never completes.  The deadline backstop (Task C1)
      // fires at ~RESPONSE_DATA_TIMEOUT_MS and tears down the originating
      // request — either with a 5xx HTTP status or a connection-reset error —
      // well within MAX_ELAPSED_MS.
      const start = Date.now();
      let timedOut = false;

      try {
        const response = await axios.get(
          `http://localhost:${bs.port}/broker/${brokerToken}/hang`,
          {
            validateStatus: () => true,
            // Generous enough to let the deadline fire; tight enough to fail
            // the test clearly if the backstop does NOT fire.
            timeout: MAX_ELAPSED_MS,
          },
        );
        const elapsed = Date.now() - start;

        // If axios received an HTTP response, it must be 5xx.
        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(elapsed).toBeLessThan(MAX_ELAPSED_MS);
      } catch (err: any) {
        const elapsed = Date.now() - start;

        // ECONNABORTED means axios's own timeout fired — the backstop did NOT
        // close the connection in time.
        if (err?.code === 'ECONNABORTED' && elapsed >= MAX_ELAPSED_MS - 200) {
          timedOut = true;
        }

        // Any other error (ECONNRESET, etc.) means the server closed the
        // socket promptly — that is a valid fail-fast outcome.
        expect(timedOut).toBe(false);
        expect(elapsed).toBeLessThan(MAX_ELAPSED_MS);
      }
    },
    MAX_ELAPSED_MS + 2_000, // individual test timeout
  );
});
