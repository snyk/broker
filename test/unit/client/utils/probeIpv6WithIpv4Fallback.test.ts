import { EventEmitter } from 'node:events';
import dns from 'node:dns';
import net from 'node:net';

jest.mock('node:dns');
jest.mock('node:net');

import { probeIpv6WithIpv4Fallback } from '../../../../lib/hybrid-sdk/client/utils/probeIpv6WithIpv4Fallback';

const mockedCreateConnection = net.createConnection as jest.Mock;
const mockedSetDefaultResultOrder = dns.setDefaultResultOrder as jest.Mock;
const mockedSetDefaultAutoSelectFamily =
  net.setDefaultAutoSelectFamily as jest.Mock;

class FakeSocket extends EventEmitter {
  destroyed = false;
  setTimeout = jest.fn();
  destroy() {
    this.destroyed = true;
  }
}

describe('probeIpv6WithIpv4Fallback', () => {
  let fakeSocket: FakeSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeSocket = new FakeSocket();
    mockedCreateConnection.mockReturnValue(fakeSocket);
  });

  it('should return "default" and keep default IP family when IPv6 connects successfully', async () => {
    const probe = probeIpv6WithIpv4Fallback('broker.snyk.io');
    fakeSocket.emit('connect');

    const result = await probe;

    expect(result).toBe('default');
    expect(mockedSetDefaultResultOrder).not.toHaveBeenCalled();
    expect(mockedSetDefaultAutoSelectFamily).not.toHaveBeenCalled();
  });

  it('should return "ipv4first" and disable Happy Eyeballs when IPv6 connection errors', async () => {
    const probe = probeIpv6WithIpv4Fallback('broker.snyk.io');
    fakeSocket.emit('error', new Error('ECONNREFUSED'));

    const result = await probe;

    expect(result).toBe('ipv4first');
    expect(mockedSetDefaultResultOrder).toHaveBeenCalledWith('ipv4first');
    expect(mockedSetDefaultAutoSelectFamily).toHaveBeenCalledWith(false);
  });

  it('should return "ipv4first" and disable Happy Eyeballs when IPv6 connection times out', async () => {
    const probe = probeIpv6WithIpv4Fallback('broker.snyk.io');
    fakeSocket.emit('timeout');

    const result = await probe;

    expect(result).toBe('ipv4first');
    expect(mockedSetDefaultResultOrder).toHaveBeenCalledWith('ipv4first');
    expect(mockedSetDefaultAutoSelectFamily).toHaveBeenCalledWith(false);
  });

  it('should pass the correct host, port and family to net.createConnection', async () => {
    const probe = probeIpv6WithIpv4Fallback('example.com', 8443);
    fakeSocket.emit('connect');
    await probe;

    expect(mockedCreateConnection).toHaveBeenCalledWith({
      host: 'example.com',
      port: 8443,
      family: 6,
    });
  });

  it('should set a timeout on the socket using the provided timeoutMs', async () => {
    const probe = probeIpv6WithIpv4Fallback('broker.snyk.io', 443, 1500);
    fakeSocket.emit('connect');
    await probe;

    expect(fakeSocket.setTimeout).toHaveBeenCalledWith(1500);
  });
});
