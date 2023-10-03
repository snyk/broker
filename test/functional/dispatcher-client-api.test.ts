const PORT = 9999;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
import { MockServer } from 'jest-mock-server';
import { HttpDispatcherServiceClient } from '../../lib/client/dispatcher/client/api';

describe('Broker Dispatcher API client', () => {
  const server = new MockServer();
  // token hashed with 256-sha algorithm
  const hashedToken =
    '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0';

  let dispatcherServerBaseUrl: string;

  beforeAll(() => server.start());
  afterAll(() => {
    server.stop();
    delete process.env.BROKER_SERVER_URL;
  });
  beforeEach(() => {
    server.reset();
    dispatcherServerBaseUrl = server.getURL().toString();
  });

  it('should return undefined when no allocation found', async () => {
    server
      .post(`/hidden/broker/${hashedToken}/connections/1`)
      .mockImplementationOnce((ctx) => {
        ctx.status = 404;
      });

    const client = new HttpDispatcherServiceClient(dispatcherServerBaseUrl);

    try {
      await client.createConnection(
        {
          hashedBrokerToken: hashedToken,
          brokerClientId: '1',
        },
        { deployment_location: 'test', broker_token_first_char: 'a' },
      );
    } catch (err) {
      expect(err).toEqual(Error('Error getting connection allocation.'));
    }
  });

  it('should return server_id for 201', async () => {
    server
      .post(`/hidden/broker/${hashedToken}/connections/1`)
      .mockImplementationOnce((ctx) => {
        ctx.status = 201;
        ctx.body = {
          data: {
            attributes: {
              server_id: 'server-id-from-dispatcher',
            },
          },
        };
      });

    const client = new HttpDispatcherServiceClient(dispatcherServerBaseUrl);

    const serverId = await client.createConnection(
      {
        hashedBrokerToken: hashedToken,
        brokerClientId: '1',
      },
      { deployment_location: 'test', broker_token_first_char: 'a' },
    );

    expect(serverId).toEqual('server-id-from-dispatcher');
  });
});
