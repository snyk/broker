import stream from 'stream';
import { EventEmitter } from 'events';

jest.mock('../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: () => ({
    brokerServerUrl: 'http://localhost:9000',
    brokerClientPostTimeout: '1000',
    universalBrokerEnabled: false,
    universalBrokerGa: false,
    RES_BODY_URL_SUB: false,
    LOG_ENABLE_BODY: 'false',
  }),
}));

jest.mock('../../lib/hybrid-sdk/client/auth/oauth', () => ({
  getAuthConfig: () => ({ accessToken: null }),
}));

jest.mock('http', () => {
  const stream = require('stream');
  return {
    request: jest.fn(() => {
      const w = new stream.Writable({
        write(_chunk: any, _enc: any, cb: any) {
          cb();
        },
      });
      return w;
    }),
  };
});

jest.mock('https', () => ({
  request: jest.fn(),
}));

describe('downstream-post-stream-to-server', () => {
  it('destroys downstream socket on timeout to avoid hanging streams', async () => {
    const { BrokerServerPostResponseHandler } = await import(
      '../../lib/hybrid-sdk/http/downstream-post-stream-to-server'
    );

    const handler = new BrokerServerPostResponseHandler(
      {
        url: '/test',
        requestMethod: 'POST',
        requestId: 'req-1',
        maskedToken: 'masked',
        hashedToken: 'hashed',
        actingOrgPublicId: 'o',
        actingGroupPublicId: 'g',
        productLine: 'p',
        flow: 'f',
      },
      {
        brokerServerUrl: 'http://localhost:9000',
        brokerClientPostTimeout: '1000',
        universalBrokerEnabled: false,
        universalBrokerGa: false,
        RES_BODY_URL_SUB: false,
        LOG_ENABLE_BODY: 'false',
      },
      'token',
      0,
      'req-1',
      'primary',
    );

    const socket = new EventEmitter() as any;
    socket.destroy = jest.fn();

    const response = new stream.PassThrough() as any;
    response.statusCode = 200;
    response.headers = { 'content-type': 'application/json' };
    response.socket = socket;

    const p = handler.forwardRequest(response, 'stream-1');

    socket.emit('timeout');

    response.end();

    await p;
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('handles socket timeout with buffer state logging', async () => {
    const { BrokerServerPostResponseHandler } = await import(
      '../../lib/hybrid-sdk/http/downstream-post-stream-to-server'
    );

    const handler = new BrokerServerPostResponseHandler(
      {
        url: '/test',
        requestMethod: 'POST',
        requestId: 'req-timeout-test',
        maskedToken: 'masked',
        hashedToken: 'hashed',
        actingOrgPublicId: 'org-123',
        actingGroupPublicId: 'group-456',
        productLine: 'code',
        flow: 'test-flow',
      },
      {
        brokerServerUrl: 'http://localhost:9000',
        brokerClientPostTimeout: '5000',
        universalBrokerEnabled: false,
        universalBrokerGa: false,
        RES_BODY_URL_SUB: false,
        LOG_ENABLE_BODY: 'false',
      },
      'test-token',
      0,
      'req-timeout-test',
      'primary',
    );

    const socket = new EventEmitter() as any;
    socket.destroy = jest.fn();

    const response = new stream.PassThrough() as any;
    response.statusCode = 200;
    response.headers = { 'content-type': 'application/json' };
    response.socket = socket;

    const p = handler.forwardRequest(response, 'stream-timeout-1');

    // Write some data before timeout
    response.write('partial data');

    socket.emit('timeout');

    response.end();

    await p;
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not crash if socket is null when timeout fires', async () => {
    const { BrokerServerPostResponseHandler } = await import(
      '../../lib/hybrid-sdk/http/downstream-post-stream-to-server'
    );

    const handler = new BrokerServerPostResponseHandler(
      {
        url: '/test',
        requestMethod: 'POST',
        requestId: 'req-1',
        maskedToken: 'masked',
        hashedToken: 'hashed',
        actingOrgPublicId: 'o',
        actingGroupPublicId: 'g',
        productLine: 'p',
        flow: 'f',
      },
      {
        brokerServerUrl: 'http://localhost:9000',
        brokerClientPostTimeout: '1000',
        universalBrokerEnabled: false,
        universalBrokerGa: false,
        RES_BODY_URL_SUB: false,
        LOG_ENABLE_BODY: 'false',
      },
      'token',
      0,
      'req-1',
      'primary',
    );

    const socket = new EventEmitter() as any;
    socket.destroy = jest.fn();

    const response = new stream.PassThrough() as any;
    response.statusCode = 200;
    response.headers = { 'content-type': 'application/json' };
    response.socket = socket;

    const p = handler.forwardRequest(response, 'stream-1');

    // Null out socket before timeout
    response.socket = null;

    // Then emit timeout - should not crash (socket?.destroy() handles null)
    socket.emit('timeout');

    response.end();

    await p;
    // destroy won't be called since response.socket is null
    expect(socket.destroy).toHaveBeenCalledTimes(0);
  });

  it('handles multiple timeout events gracefully', async () => {
    const { BrokerServerPostResponseHandler } = await import(
      '../../lib/hybrid-sdk/http/downstream-post-stream-to-server'
    );

    const handler = new BrokerServerPostResponseHandler(
      {
        url: '/test',
        requestMethod: 'POST',
        requestId: 'req-1',
        maskedToken: 'masked',
        hashedToken: 'hashed',
        actingOrgPublicId: 'o',
        actingGroupPublicId: 'g',
        productLine: 'p',
        flow: 'f',
      },
      {
        brokerServerUrl: 'http://localhost:9000',
        brokerClientPostTimeout: '1000',
        universalBrokerEnabled: false,
        universalBrokerGa: false,
        RES_BODY_URL_SUB: false,
        LOG_ENABLE_BODY: 'false',
      },
      'token',
      0,
      'req-1',
      'primary',
    );

    const socket = new EventEmitter() as any;
    socket.destroy = jest.fn();

    const response = new stream.PassThrough() as any;
    response.statusCode = 200;
    response.headers = { 'content-type': 'application/json' };
    response.socket = socket;

    const p = handler.forwardRequest(response, 'stream-1');

    // Emit timeout multiple times
    socket.emit('timeout');
    socket.emit('timeout');
    socket.emit('timeout');

    response.end();

    await p;
    // destroy should be called multiple times (once per timeout event)
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('handles response with non-200 status code', async () => {
    const { BrokerServerPostResponseHandler } = await import(
      '../../lib/hybrid-sdk/http/downstream-post-stream-to-server'
    );

    const handler = new BrokerServerPostResponseHandler(
      {
        url: '/test',
        requestMethod: 'POST',
        requestId: 'req-1',
        maskedToken: 'masked',
        hashedToken: 'hashed',
        actingOrgPublicId: 'o',
        actingGroupPublicId: 'g',
        productLine: 'p',
        flow: 'f',
      },
      {
        brokerServerUrl: 'http://localhost:9000',
        brokerClientPostTimeout: '1000',
        universalBrokerEnabled: false,
        universalBrokerGa: false,
        RES_BODY_URL_SUB: false,
        LOG_ENABLE_BODY: 'false',
      },
      'token',
      0,
      'req-1',
      'primary',
    );

    const socket = new EventEmitter() as any;
    socket.destroy = jest.fn();

    const response = new stream.PassThrough() as any;
    response.statusCode = 500;
    response.headers = { 'content-type': 'application/json' };
    response.socket = socket;

    const p = handler.forwardRequest(response, 'stream-1');

    socket.emit('timeout');

    response.end();

    await p;
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });
});
