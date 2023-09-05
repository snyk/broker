process.env.SNYK_BROKER_SERVER_UNIVERSAL_CONFIG_ENABLED = 'true';
import path from 'path';
import { axiosClient } from '../setup/axios-client';
import {
  BrokerClient,
  closeBrokerClient,
  createBrokerClient,
} from '../setup/broker-client';
import {
  BrokerServer,
  closeBrokerServer,
  createBrokerServer,
  waitForBrokerClientConnection,
} from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker server', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;

  const spyLogWarn = jest
    .spyOn(require('bunyan').prototype, 'warn')
    .mockImplementation((value) => {
      return value;
    });

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ filters: serverAccept, port: 8100 });

    bc = await createBrokerClient({
      brokerServerUrl: `http://localhost:${bs.port}`,
      brokerToken: 'broker-token-12345',
      filters: clientAccept,
      type: 'client',
    });
    ({ brokerToken } = await waitForBrokerClientConnection(bs));
  });

  afterEach(async () => {
    spyLogWarn.mockReset();
  });
  afterAll(async () => {
    spyLogWarn.mockReset();
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
  });

  it('successfully broker GET', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-param/xyz`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');
  });

  it('successfully warn logs requests without x-snyk-broker-type header', async () => {
    const response = await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/echo-param/xyz`,
    );

    expect(response.status).toEqual(200);
    expect(response.data).toEqual('xyz');

    expect(spyLogWarn).toHaveBeenCalledTimes(1);
    expect(spyLogWarn).toHaveBeenCalledWith(
      expect.any(Object),
      'Error: Request does not contain the x-snyk-broker-type header',
    );
  });
});
