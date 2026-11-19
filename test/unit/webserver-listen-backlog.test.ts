import { Server } from 'http';
import { webserver } from '../../lib/hybrid-sdk/common/http/webserver';
import { choosePort } from '../setup/detect-port';

describe('broker server webserver listen backlog', () => {
  let server: Server | undefined;
  let listen: jest.SpyInstance;
  const originalBrokerType = process.env.BROKER_TYPE;

  const start = async (config: Record<string, unknown>) => {
    const port = await choosePort(9870);
    ({ server } = webserver(config, port));
    return server!;
  };

  beforeEach(() => {
    delete process.env.BROKER_TYPE;
    listen = jest.spyOn(Server.prototype, 'listen');
  });

  afterEach(async () => {
    listen.mockRestore();
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

  it('listens with a larger backlog on the broker server, without BROKER_TYPE set', async () => {
    await start({ brokerType: 'server' });
    expect(listen).toHaveBeenCalledWith(
      expect.objectContaining({ backlog: 4096 }),
    );
  });

  it('applies BROKER_WEBSERVER_LISTEN_BACKLOG on the broker server', async () => {
    await start({
      brokerType: 'server',
      BROKER_WEBSERVER_LISTEN_BACKLOG: '1024',
    });
    expect(listen).toHaveBeenCalledWith(
      expect.objectContaining({ backlog: 1024 }),
    );
  });

  it('falls back to the default backlog when BROKER_WEBSERVER_LISTEN_BACKLOG is not a positive integer', async () => {
    await start({
      brokerType: 'server',
      BROKER_WEBSERVER_LISTEN_BACKLOG: '0',
    });
    expect(listen).toHaveBeenCalledWith(
      expect.objectContaining({ backlog: 4096 }),
    );
  });

  it('keeps honouring BROKER_TYPE=server for backwards compatibility', async () => {
    process.env.BROKER_TYPE = 'server';
    await start({});
    expect(listen).toHaveBeenCalledWith(
      expect.objectContaining({ backlog: 4096 }),
    );
  });

  it('leaves the Node default backlog on the broker client', async () => {
    // On the client BROKER_TYPE holds the SCM type (e.g. gitlab), not the broker role.
    process.env.BROKER_TYPE = 'gitlab';
    await start({ brokerType: 'client' });
    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen.mock.calls[0]).toHaveLength(1);
    expect(typeof listen.mock.calls[0][0]).toBe('number');
  });
});
