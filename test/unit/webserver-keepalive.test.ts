import { Server } from 'http';
import { webserver } from '../../lib/hybrid-sdk/common/http/webserver';
import { choosePort } from '../setup/detect-port';

const NODE_DEFAULT_KEEPALIVE_TIMEOUT = new Server().keepAliveTimeout;

describe('broker server webserver connection settings', () => {
  let server: Server | undefined;
  const originalBrokerType = process.env.BROKER_TYPE;

  const start = async (config: Record<string, unknown>) => {
    const port = await choosePort(9850);
    ({ server } = webserver(config, port));
    return server!;
  };

  beforeEach(() => {
    delete process.env.BROKER_TYPE;
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server!.close(resolve));
      server = undefined;
    }
    if (originalBrokerType === undefined) {
      delete process.env.BROKER_TYPE;
    } else {
      process.env.BROKER_TYPE = originalBrokerType;
    }
  });

  it('uses the long server keep-alive when running as the broker server, without BROKER_TYPE set', async () => {
    const s = await start({ brokerType: 'server' });
    expect(s.keepAliveTimeout).toEqual(650000);
  });

  it('applies BROKER_WEBSERVER_KEEPALIVE_TIMEOUT from the environment as a number', async () => {
    const s = await start({
      brokerType: 'server',
      BROKER_WEBSERVER_KEEPALIVE_TIMEOUT: '1800000',
    });
    expect(s.keepAliveTimeout).toStrictEqual(1800000);
  });

  it('falls back to the default when BROKER_WEBSERVER_KEEPALIVE_TIMEOUT is not a positive integer', async () => {
    const s = await start({
      brokerType: 'server',
      BROKER_WEBSERVER_KEEPALIVE_TIMEOUT: 'not-a-number',
    });
    expect(s.keepAliveTimeout).toEqual(650000);
  });

  it('keeps honouring BROKER_TYPE=server for backwards compatibility', async () => {
    process.env.BROKER_TYPE = 'server';
    const s = await start({});
    expect(s.keepAliveTimeout).toEqual(650000);
  });

  it('leaves the Node default keep-alive on the broker client', async () => {
    // On the client BROKER_TYPE holds the SCM type (e.g. gitlab), not the broker role.
    process.env.BROKER_TYPE = 'gitlab';
    const s = await start({ brokerType: 'client' });
    expect(s.keepAliveTimeout).toEqual(NODE_DEFAULT_KEEPALIVE_TIMEOUT);
  });
});
