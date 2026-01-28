import http from 'http';
import { Socket } from 'net';
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
      process.nextTick(() => mockResponse.emit('end'));
      await forwardPromise;

      await new Promise((resolve) => setTimeout(resolve, shortTimeout + 100));

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

      mockSocket.destroy();
    });
  });
});
