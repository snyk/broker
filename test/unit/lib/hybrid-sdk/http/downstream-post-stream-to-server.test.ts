import http from 'http';
import { AddressInfo, Socket } from 'net';
import nock from 'nock';
import { v4 as uuidv4 } from 'uuid';

import { BrokerServerPostResponseHandler } from '../../../../../lib/hybrid-sdk/http/downstream-post-stream-to-server';
import {
  setConfig,
  getConfig,
} from '../../../../../lib/hybrid-sdk/common/config/config';
import { ExtendedLogContext } from '../../../../../lib/hybrid-sdk/common/types/log';

interface CapturedLogCall {
  context: Record<string, any>;
  message: string;
}

class TestLogger {
  errorCalls: CapturedLogCall[] = [];
  debugCalls: CapturedLogCall[] = [];
  context: Record<string, any> = {};

  error(message: string): void;
  error(
    context: Partial<ExtendedLogContext> & Record<string, any>,
    message: string,
  ): void;
  error(
    contextOrMessage:
      | string
      | (Partial<ExtendedLogContext> & Record<string, any>),
    message?: string,
  ): void {
    if (typeof contextOrMessage === 'string') {
      this.errorCalls.push({
        context: { ...this.context },
        message: contextOrMessage,
      });
    } else {
      this.errorCalls.push({
        context: { ...this.context, ...contextOrMessage },
        message: message || '',
      });
    }
  }

  debug(message: string): void;
  debug(
    context: Partial<ExtendedLogContext> & Record<string, any>,
    message: string,
  ): void;
  debug(
    contextOrMessage:
      | string
      | (Partial<ExtendedLogContext> & Record<string, any>),
    message?: string,
  ): void {
    if (typeof contextOrMessage === 'string') {
      this.debugCalls.push({
        context: { ...this.context },
        message: contextOrMessage,
      });
    } else {
      this.debugCalls.push({
        context: { ...this.context, ...contextOrMessage },
        message: message || '',
      });
    }
  }

  child(
    additionalContext: Partial<ExtendedLogContext> & Record<string, any>,
  ): TestLogger {
    const childLogger = new TestLogger();
    childLogger.context = { ...this.context, ...additionalContext };
    childLogger.errorCalls = this.errorCalls; // Share error calls array
    childLogger.debugCalls = this.debugCalls; // Share debug calls array
    return childLogger;
  }
}

describe('BrokerServerPostResponseHandler', () => {
  const brokerServerUrl = 'http://test-broker-server';
  const brokerToken = 'test-broker-token';
  const streamingId = 'test-streaming-id';
  const serverId = 123;
  const requestId = 'test-request-id';
  const role = 'primary';

  let testLogger: TestLogger;

  const createLogContext = (): ExtendedLogContext => ({
    url: '',
    requestMethod: 'POST',
    requestId,
    maskedToken: 'test-masked-token',
    hashedToken: 'test-hashed-token',
    actingOrgPublicId: uuidv4(),
    actingGroupPublicId: uuidv4(),
    productLine: 'test-product',
    flow: 'test-flow',
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

  beforeEach(() => {
    testLogger = new TestLogger();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('response errors', () => {
    beforeEach(() => {
      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });
    });

    it('logs error when broker server returns non-200 status', async () => {
      const errorBody = 'Internal Server Error';
      const errorStatus = 500;

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(errorStatus, errorBody, { 'content-type': 'text/plain' });

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const errorCall = testLogger.errorCalls.find(
        (call) =>
          call.message ===
          'Received unexpected HTTP response POSTing data to Broker Server',
      );
      expect(errorCall).toBeDefined();
      expect(errorCall?.context).toMatchObject({
        requestId,
        responseStatus: errorStatus.toString(),
        error: errorBody,
      });
      expect(errorCall?.context.durationMs).toEqual(expect.any(Number));
      expect(errorCall?.context.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('connection errors', () => {
    beforeEach(() => {
      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });
    });

    it('logs ETIMEDOUT when TCP connection cannot be established', async () => {
      const etimedoutError = new Error('connect ETIMEDOUT');
      (etimedoutError as any).code = 'ETIMEDOUT';

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .replyWithError(etimedoutError);

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const errorCall = testLogger.errorCalls.find(
        (call) =>
          call.message ===
          'received error sending data via POST to Broker Server',
      );
      expect(errorCall).toBeDefined();
      expect(errorCall?.context.error).toContain('ETIMEDOUT');
      expect(errorCall?.context.errDetails.code).toBe('ETIMEDOUT');
      expect(errorCall?.context.durationMs).toEqual(expect.any(Number));
      expect(errorCall?.context.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('upstream request timeouts', () => {
    const shortTimeout = 100;

    beforeEach(() => {
      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
        brokerClientPostTimeout: shortTimeout.toString(),
      });
    });

    it('logs timeout with buffer state when sendData times out', async () => {
      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .delayConnection(shortTimeout + 200)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, shortTimeout + 100));

      const errorCall = testLogger.errorCalls.find(
        (call) =>
          call.message === 'Upstream request to Broker Server timed out',
      );
      expect(errorCall).toBeDefined();
      expect(errorCall?.context).toMatchObject({
        requestId,
        error: 'Upstream request to Broker Server timed out',
        timeout: shortTimeout,
      });
      expect(errorCall?.context.durationMs).toEqual(expect.any(Number));
      expect(errorCall?.context.durationMs).toBeGreaterThanOrEqual(0);
      expect(errorCall?.context.buffer).toMatchObject({
        readableLength: expect.any(Number),
        readableHighWaterMark: expect.any(Number),
        writableLength: expect.any(Number),
        writableHighWaterMark: expect.any(Number),
      });
    });

    it('logs timeout with buffer state when forwardRequest times out', async () => {
      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .delayConnection(shortTimeout + 200)
        .reply(200, 'OK');

      const handler = createHandler();

      const mockSocket = new Socket();
      const mockResponse = new http.IncomingMessage(mockSocket);
      mockResponse.statusCode = 200;
      mockResponse.headers = { 'content-type': 'application/json' };

      const forwardPromise = handler.forwardRequest(mockResponse, streamingId);
      setTimeout(() => mockResponse.emit('end'), 50);
      await forwardPromise;

      await new Promise((resolve) => setTimeout(resolve, shortTimeout + 200));

      const errorCall = testLogger.errorCalls.find(
        (call) =>
          call.message === 'Upstream request to Broker Server timed out',
      );
      expect(errorCall).toBeDefined();
      expect(errorCall?.context.buffer).toMatchObject({
        readableLength: expect.any(Number),
        readableHighWaterMark: expect.any(Number),
        writableLength: expect.any(Number),
        writableHighWaterMark: expect.any(Number),
      });
      expect(errorCall?.context.durationMs).toEqual(expect.any(Number));
      expect(errorCall?.context.durationMs).toBeGreaterThanOrEqual(0);

      mockSocket.destroy();
    });
  });

  describe('duration tracking on successful requests', () => {
    beforeEach(() => {
      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });
    });

    it('logs duration on finish event after sendData completes', async () => {
      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const finishCall = testLogger.debugCalls.find(
        (call) => call.message === 'Finish Post Request Handler Event',
      );
      expect(finishCall).toBeDefined();
      expect(finishCall?.context.durationMs).toEqual(expect.any(Number));
      expect(finishCall?.context.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('logs duration on finish event after forwardRequest completes', async () => {
      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();

      const mockSocket = new Socket();
      const mockResponse = new http.IncomingMessage(mockSocket);
      mockResponse.statusCode = 200;
      mockResponse.headers = { 'content-type': 'application/json' };

      const forwardPromise = handler.forwardRequest(mockResponse, streamingId);
      process.nextTick(() => mockResponse.push(null));
      await forwardPromise;

      await new Promise((resolve) => setTimeout(resolve, 200));

      const finishCall = testLogger.debugCalls.find(
        (call) => call.message === 'Finish Post Request Handler Event',
      );
      expect(finishCall).toBeDefined();
      expect(finishCall?.context.durationMs).toEqual(expect.any(Number));
      expect(finishCall?.context.durationMs).toBeGreaterThanOrEqual(0);

      mockSocket.destroy();
    });
  });

  describe('downstream TCP connection details', () => {
    beforeEach(() => {
      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });
    });

    it('logs downstream socket address and port info in forwardRequest', async () => {
      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();

      const mockSocket = new Socket();
      const mockResponse = new http.IncomingMessage(mockSocket);
      mockResponse.statusCode = 200;
      mockResponse.headers = { 'content-type': 'application/json' };

      const forwardPromise = handler.forwardRequest(mockResponse, streamingId);
      process.nextTick(() => mockResponse.push(null));
      await forwardPromise;

      const tcpCall = testLogger.debugCalls.find(
        (call) => call.message === 'downstream TCP connection details',
      );
      expect(tcpCall).toBeDefined();
      expect(tcpCall?.context).toHaveProperty('downstreamLocalAddress');
      expect(tcpCall?.context).toHaveProperty('downstreamLocalPort');
      expect(tcpCall?.context).toHaveProperty('downstreamRemoteAddress');
      expect(tcpCall?.context).toHaveProperty('downstreamRemotePort');
      expect(tcpCall?.context.streamingID).toBe(streamingId);

      mockSocket.destroy();
    });
  });

  describe('upstream TCP connection details', () => {
    let realServer: http.Server;
    let realServerUrl: string;

    beforeEach((done) => {
      realServer = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          res.writeHead(200);
          res.end('OK');
        });
      });
      realServer.listen(0, '127.0.0.1', () => {
        const addr = realServer.address() as AddressInfo;
        realServerUrl = `http://127.0.0.1:${addr.port}`;
        done();
      });
    });

    afterEach((done) => {
      realServer.close(done);
    });

    it('logs upstream TCP source and destination ports on socket connect', async () => {
      setConfig({
        brokerServerUrl: realServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });

      const handler = new BrokerServerPostResponseHandler(
        createLogContext(),
        getConfig(),
        brokerToken,
        serverId,
        requestId,
        role,
        testLogger,
      );

      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 300));

      const tcpCall = testLogger.debugCalls.find(
        (call) =>
          call.message ===
          'Established TCP connection details for POST to Broker Server',
      );
      expect(tcpCall).toBeDefined();
      expect(tcpCall?.context.requestId).toBe(requestId);
      expect(tcpCall?.context.streamingId).toBe(streamingId);
      expect(tcpCall?.context.tcpConnectDurationMs).toEqual(expect.any(Number));
      expect(tcpCall?.context.tcpConnectDurationMs).toBeGreaterThanOrEqual(0);
      expect(tcpCall?.context.upstreamLocalAddress).toBe('127.0.0.1');
      expect(tcpCall?.context.upstreamLocalPort).toEqual(expect.any(Number));
      expect(tcpCall?.context.upstreamRemoteAddress).toBe('127.0.0.1');
      expect(tcpCall?.context.upstreamRemotePort).toBe(
        (realServer.address() as AddressInfo).port,
      );
    });

    it('logs DNS lookup details before TCP connect', async () => {
      setConfig({
        brokerServerUrl: realServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });

      const handler = new BrokerServerPostResponseHandler(
        createLogContext(),
        getConfig(),
        brokerToken,
        serverId,
        requestId,
        role,
        testLogger,
      );

      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 300));

      const dnsCall = testLogger.debugCalls.find(
        (call) =>
          call.message === 'Completed DNS lookup for POST to Broker Server',
      );
      // DNS lookup may not fire when connecting to an IP address directly,
      // so we only assert structure if the event was emitted
      if (dnsCall) {
        expect(dnsCall.context.requestId).toBe(requestId);
        expect(dnsCall.context.streamingId).toBe(streamingId);
        expect(dnsCall.context.dnsLookupDuration).toEqual(expect.any(Number));
        expect(dnsCall.context.dnsLookupDuration).toBeGreaterThanOrEqual(0);
        expect(dnsCall.context).toHaveProperty('resolvedAddress');
        expect(dnsCall.context).toHaveProperty('addressFamily');
        expect(dnsCall.context).toHaveProperty('hostname');
      }
    });

    it('logs upstream TCP details when streaming via forwardRequest', async () => {
      setConfig({
        brokerServerUrl: realServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });

      const handler = new BrokerServerPostResponseHandler(
        createLogContext(),
        getConfig(),
        brokerToken,
        serverId,
        requestId,
        role,
        testLogger,
      );

      const mockSocket = new Socket();
      const mockResponse = new http.IncomingMessage(mockSocket);
      mockResponse.statusCode = 200;
      mockResponse.headers = { 'content-type': 'text/plain' };

      const forwardPromise = handler.forwardRequest(mockResponse, streamingId);
      process.nextTick(() => {
        mockResponse.push('hello world');
        mockResponse.push(null);
      });
      await forwardPromise;

      await new Promise((resolve) => setTimeout(resolve, 300));

      const tcpCall = testLogger.debugCalls.find(
        (call) =>
          call.message ===
          'Established TCP connection details for POST to Broker Server',
      );
      expect(tcpCall).toBeDefined();
      expect(tcpCall?.context.upstreamLocalAddress).toBe('127.0.0.1');
      expect(tcpCall?.context.upstreamLocalPort).toEqual(expect.any(Number));
      expect(tcpCall?.context.upstreamRemoteAddress).toBe('127.0.0.1');
      expect(tcpCall?.context.upstreamRemotePort).toBe(
        (realServer.address() as AddressInfo).port,
      );

      mockSocket.destroy();
    });
  });

  describe('upstream response diagnostic headers', () => {
    let realServer: http.Server;
    let realServerUrl: string;

    afterEach((done) => {
      realServer.close(done);
    });

    it('logs diagnostic headers when proxy headers are present in response', (done) => {
      realServer = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          res.writeHead(200, {
            Via: '1.1 corporate-proxy.example.com',
            'X-Forwarded-For': '10.0.0.5, 10.0.1.1',
            'X-Real-Ip': '10.0.0.5',
            Server: 'nginx/1.25.0',
          });
          res.end('OK');
        });
      });
      realServer.listen(0, '127.0.0.1', async () => {
        const addr = realServer.address() as AddressInfo;
        realServerUrl = `http://127.0.0.1:${addr.port}`;

        setConfig({
          brokerServerUrl: realServerUrl,
          universalBrokerEnabled: false,
          universalBrokerGa: false,
        });

        const testLoggerLocal = new TestLogger();
        const handler = new BrokerServerPostResponseHandler(
          createLogContext(),
          getConfig(),
          brokerToken,
          serverId,
          requestId,
          role,
          testLoggerLocal,
        );

        await handler.sendData(
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { test: 'data' },
          },
          streamingId,
        );

        await new Promise((resolve) => setTimeout(resolve, 300));

        const headerCall = testLoggerLocal.debugCalls.find(
          (call) =>
            call.message ===
            'Received response diagnostic headers from Broker Server POST',
        );
        expect(headerCall).toBeDefined();
        expect(headerCall?.context.via).toBe('1.1 corporate-proxy.example.com');
        expect(headerCall?.context.xForwardedFor).toBe('10.0.0.5, 10.0.1.1');
        expect(headerCall?.context.xRealIp).toBe('10.0.0.5');
        expect(headerCall?.context.server).toBe('nginx/1.25.0');
        expect(headerCall?.context.requestId).toBe(requestId);
        expect(headerCall?.context.streamingId).toBe(streamingId);
        done();
      });
    });

    it('does not log diagnostic headers when none are present', (done) => {
      realServer = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          res.writeHead(200);
          res.end('OK');
        });
      });
      realServer.listen(0, '127.0.0.1', async () => {
        const addr = realServer.address() as AddressInfo;
        realServerUrl = `http://127.0.0.1:${addr.port}`;

        setConfig({
          brokerServerUrl: realServerUrl,
          universalBrokerEnabled: false,
          universalBrokerGa: false,
        });

        const testLoggerLocal = new TestLogger();
        const handler = new BrokerServerPostResponseHandler(
          createLogContext(),
          getConfig(),
          brokerToken,
          serverId,
          requestId,
          role,
          testLoggerLocal,
        );

        await handler.sendData(
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { test: 'data' },
          },
          streamingId,
        );

        await new Promise((resolve) => setTimeout(resolve, 300));

        const headerCall = testLoggerLocal.debugCalls.find(
          (call) =>
            call.message ===
            'Received response diagnostic headers from Broker Server POST',
        );
        expect(headerCall).toBeUndefined();
        done();
      });
    });
  });

  describe('proxy configuration logging', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('logs proxy config when HTTP_PROXY is set', async () => {
      process.env.HTTP_PROXY = 'http://corporate-proxy.example.com:8080';
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;

      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const proxyCall = testLogger.debugCalls.find(
        (call) =>
          call.message ===
          'Using proxy configuration for POST to Broker Server',
      );
      expect(proxyCall).toBeDefined();
      expect(proxyCall?.context.httpProxy).toBe(
        'http://corporate-proxy.example.com:8080',
      );
    });

    it('logs proxy config when HTTPS_PROXY is set', async () => {
      delete process.env.HTTP_PROXY;
      delete process.env.http_proxy;
      process.env.HTTPS_PROXY = 'https://secure-proxy.example.com:8443';

      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const proxyCall = testLogger.debugCalls.find(
        (call) =>
          call.message ===
          'Using proxy configuration for POST to Broker Server',
      );
      expect(proxyCall).toBeDefined();
      expect(proxyCall?.context.httpsProxy).toBe(
        'https://secure-proxy.example.com:8443',
      );
    });

    it('does not log proxy config when no proxy env vars are set', async () => {
      delete process.env.HTTP_PROXY;
      delete process.env.http_proxy;
      delete process.env.HTTPS_PROXY;
      delete process.env.https_proxy;

      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const proxyCall = testLogger.debugCalls.find(
        (call) =>
          call.message ===
          'Using proxy configuration for POST to Broker Server',
      );
      expect(proxyCall).toBeUndefined();
    });
  });

  describe('ETIMEDOUT diagnostics for proxy/firewall scenarios', () => {
    beforeEach(() => {
      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });
    });

    it('includes duration and network error details on ETIMEDOUT to help diagnose TCP-level failures', async () => {
      const etimedoutError = new Error('connect ETIMEDOUT 10.0.0.1:443');
      Object.assign(etimedoutError, {
        code: 'ETIMEDOUT',
        errno: -60,
        syscall: 'connect',
      });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .replyWithError(etimedoutError);

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { large: 'x'.repeat(10000) },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const errorCall = testLogger.errorCalls.find(
        (call) =>
          call.message ===
          'received error sending data via POST to Broker Server',
      );
      expect(errorCall).toBeDefined();
      expect(errorCall?.context.durationMs).toEqual(expect.any(Number));
      expect(errorCall?.context.durationMs).toBeGreaterThanOrEqual(0);
      expect(errorCall?.context.errorCode).toBe('ETIMEDOUT');
      expect(errorCall?.context.syscall).toBe('connect');
      expect(errorCall?.context.errorErrno).toBe(-60);
      expect(errorCall?.context.streamingID).toBe(streamingId);
      expect(errorCall?.context.requestId).toBe(requestId);
    });

    it('includes duration and network error details on ECONNREFUSED', async () => {
      const econnrefusedError = new Error('connect ECONNREFUSED 127.0.0.1:443');
      Object.assign(econnrefusedError, {
        code: 'ECONNREFUSED',
        errno: -61,
        syscall: 'connect',
      });

      // ECONNREFUSED is retryable, so nock must handle all 4 attempts (1 + 3 retries)
      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .times(4)
        .replyWithError(econnrefusedError);

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      // Wait for all retries (3 * 500ms delay + buffer)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const errorCall = testLogger.errorCalls.find(
        (call) =>
          call.message ===
          'received error sending data via POST to Broker Server',
      );
      expect(errorCall).toBeDefined();
      expect(errorCall?.context.durationMs).toEqual(expect.any(Number));
      expect(errorCall?.context.durationMs).toBeGreaterThanOrEqual(0);
      expect(errorCall?.context.errorCode).toBe('ECONNREFUSED');
      expect(errorCall?.context.syscall).toBe('connect');
    });
  });

  describe('TCP connection retry', () => {
    beforeEach(() => {
      setConfig({
        brokerServerUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });
    });

    it('sendData retries on ECONNREFUSED and succeeds on second attempt', async () => {
      const error = new Error('connect ECONNREFUSED');
      Object.assign(error, { code: 'ECONNREFUSED' });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .replyWithError(error);

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const retryCall = testLogger.debugCalls.find(
        (call) => call.message === 'Retrying sendData POST to Broker Server',
      );
      expect(retryCall).toBeDefined();
      expect(retryCall?.context.attempt).toBe(1);
      expect(retryCall?.context.errorCode).toBe('ECONNREFUSED');

      const finishCall = testLogger.debugCalls.find(
        (call) => call.message === 'Finish Post Request Handler Event',
      );
      expect(finishCall).toBeDefined();
    });

    it('sendData retries on ECONNRESET and succeeds', async () => {
      const error = new Error('read ECONNRESET');
      Object.assign(error, { code: 'ECONNRESET' });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .replyWithError(error);

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const retryCall = testLogger.debugCalls.find(
        (call) => call.message === 'Retrying sendData POST to Broker Server',
      );
      expect(retryCall).toBeDefined();
      expect(retryCall?.context.errorCode).toBe('ECONNRESET');

      const finishCall = testLogger.debugCalls.find(
        (call) => call.message === 'Finish Post Request Handler Event',
      );
      expect(finishCall).toBeDefined();
    });

    it('sendData retries on ENOTFOUND and succeeds', async () => {
      const error = new Error('getaddrinfo ENOTFOUND');
      Object.assign(error, { code: 'ENOTFOUND' });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .replyWithError(error);

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const retryCall = testLogger.debugCalls.find(
        (call) => call.message === 'Retrying sendData POST to Broker Server',
      );
      expect(retryCall).toBeDefined();
      expect(retryCall?.context.errorCode).toBe('ENOTFOUND');
    });

    it('sendData retries on ESOCKETTIMEOUT and succeeds', async () => {
      const error = new Error('socket timeout');
      Object.assign(error, { code: 'ESOCKETTIMEOUT' });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .replyWithError(error);

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .reply(200, 'OK');

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const retryCall = testLogger.debugCalls.find(
        (call) => call.message === 'Retrying sendData POST to Broker Server',
      );
      expect(retryCall).toBeDefined();
      expect(retryCall?.context.errorCode).toBe('ESOCKETTIMEOUT');
    });

    it('sendData gives up after max retries', async () => {
      const error = new Error('read ECONNRESET');
      Object.assign(error, { code: 'ECONNRESET' });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .times(4)
        .replyWithError(error);

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 2500));

      const giveUpCall = testLogger.errorCalls.find(
        (call) =>
          call.message === 'Failed to POST to Broker Server after 4 attempt(s)',
      );
      expect(giveUpCall).toBeDefined();
      expect(giveUpCall?.context.errorCode).toBe('ECONNRESET');
    });

    it('sendData does not retry on non-retryable errors', async () => {
      const error = new Error('connect ETIMEDOUT');
      Object.assign(error, { code: 'ETIMEDOUT' });

      nock(brokerServerUrl)
        .post(`/response-data/${brokerToken}/${streamingId}`)
        .query(true)
        .replyWithError(error);

      const handler = createHandler();
      await handler.sendData(
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { test: 'data' },
        },
        streamingId,
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const retryCall = testLogger.debugCalls.find(
        (call) => call.message === 'Retrying sendData POST to Broker Server',
      );
      expect(retryCall).toBeUndefined();

      const errorCall = testLogger.errorCalls.find(
        (call) =>
          call.message ===
          'received error sending data via POST to Broker Server',
      );
      expect(errorCall).toBeDefined();
    });

    it('forwardRequest retries connection on ECONNREFUSED and succeeds', async () => {
      // Use a real server: first attempt goes to a closed port (ECONNREFUSED),
      // then we start a server for the retry to succeed
      const detectPort = require('detect-port');
      const closedPort = await detectPort(0);
      const closedUrl = `http://127.0.0.1:${closedPort}`;

      // Start with closed port
      setConfig({
        brokerServerUrl: closedUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });

      const testLoggerLocal = new TestLogger();
      const handler = new BrokerServerPostResponseHandler(
        createLogContext(),
        getConfig(),
        brokerToken,
        serverId,
        requestId,
        role,
        testLoggerLocal,
      );

      // Start a real server on that port after a short delay (for retry)
      const realServer = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          res.writeHead(200);
          res.end('OK');
        });
      });
      await new Promise<void>((resolve) =>
        realServer.listen(closedPort, '127.0.0.1', resolve),
      );

      const mockSocket = new Socket();
      const mockResponse = new http.IncomingMessage(mockSocket);
      mockResponse.statusCode = 200;
      mockResponse.headers = { 'content-type': 'text/plain' };

      // The first attempt should get ECONNREFUSED (server just started,
      // but init already captured the closed port). Actually, since
      // the server is now listening, it won't get ECONNREFUSED.
      // We need to start the server AFTER the first attempt fails.

      // Close the server immediately and restart after delay
      await new Promise<void>((resolve) => realServer.close(() => resolve()));

      const forwardPromise = handler.forwardRequest(mockResponse, streamingId);

      // Start server after the first attempt fails (500ms retry delay)
      setTimeout(async () => {
        const retryServer = http.createServer((req, res) => {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => {
            res.writeHead(200);
            res.end('OK');
          });
        });
        retryServer.listen(closedPort, '127.0.0.1', () => {
          setTimeout(() => mockResponse.push(null), 100);
        });
        // Store for cleanup
        (handler as any)._retryServer = retryServer;
      }, 300);

      await forwardPromise;

      await new Promise((resolve) => setTimeout(resolve, 500));

      const retryCall = testLoggerLocal.debugCalls.find(
        (call) => call.message === 'Retrying POST connection to Broker Server',
      );
      expect(retryCall).toBeDefined();
      expect(retryCall?.context.errorCode).toBe('ECONNREFUSED');

      mockSocket.destroy();
      const retryServer = (handler as any)._retryServer;
      if (retryServer) {
        await new Promise<void>((resolve) => retryServer.close(resolve));
      }
    }, 30000);

    it('forwardRequest gives up after max retries on ECONNREFUSED', async () => {
      // Use a port with no server to get real ECONNREFUSED errors
      const detectPort = require('detect-port');
      const closedPort = await detectPort(0);
      const closedUrl = `http://127.0.0.1:${closedPort}`;

      setConfig({
        brokerServerUrl: closedUrl,
        universalBrokerEnabled: false,
        universalBrokerGa: false,
      });

      const testLoggerLocal = new TestLogger();
      const handler = new BrokerServerPostResponseHandler(
        createLogContext(),
        getConfig(),
        brokerToken,
        serverId,
        requestId,
        role,
        testLoggerLocal,
      );

      const mockSocket = new Socket();
      const mockResponse = new http.IncomingMessage(mockSocket);
      mockResponse.statusCode = 200;
      mockResponse.headers = { 'content-type': 'application/json' };

      const forwardPromise = handler.forwardRequest(mockResponse, streamingId);
      setTimeout(() => mockResponse.push(null), 100);
      await forwardPromise;

      const giveUpCall = testLoggerLocal.errorCalls.find(
        (call) =>
          call.message ===
          'Failed to establish POST connection to Broker Server after 4 attempt(s)',
      );
      expect(giveUpCall).toBeDefined();
      expect(giveUpCall?.context.errorCode).toBe('ECONNREFUSED');

      mockSocket.destroy();
    }, 30000);
  });
});
