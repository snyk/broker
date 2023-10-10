const PORT = 9999;
process.env.BROKER_SERVER_URL = `http://localhost:${PORT}`;
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

describe('correctly handle pool of multiple clients with same BROKER_TOKEN', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bcFirst: BrokerClient;
  let bcSecond: BrokerClient;
  let brokerToken: string;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ port: PORT, filters: serverAccept });
  });
  afterAll(async () => {
    await tws.server.close();
    await closeBrokerServer(bs);
    delete process.env.BROKER_SERVER_URL;
  });

  describe('1st client', () => {
    beforeAll(async () => {
      bcFirst = await createBrokerClient({
        brokerServerUrl: `${process.env.BROKER_SERVER_URL}`,
        brokerToken: '12345',
        filters: clientAccept,
      });
      ({ brokerToken } = await waitForBrokerClientConnection(bs));
    });
    afterAll(async () => {
      await closeBrokerClient(bcFirst);
      delete process.env.BROKER_SERVER_URL;
    });

    it('successfully broker POST with 1st connected client', async () => {
      const response = await axiosClient.post(
        `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
        { echo: 'body' },
      );

      expect(response.status).toEqual(200);
    });
  });

  describe('2nd client', () => {
    beforeAll(async () => {
      bcFirst = await createBrokerClient({
        brokerServerUrl: `http://localhost:${bs.port}`,
        brokerToken: '12345',
        filters: clientAccept,
      });
      bcSecond = await createBrokerClient({
        brokerServerUrl: `http://localhost:${bs.port}`,
        brokerToken: '12345',
        filters: clientAccept,
      });
      ({ brokerToken } = await waitForBrokerClientConnection(bs));
    });
    afterAll(async () => {
      await closeBrokerClient(bcFirst);
      await closeBrokerClient(bcSecond);
    });

    it('successfully broker POST with 2nd client', async () => {
      const response = await axiosClient.post(
        `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
        { echo: 'body' },
      );

      expect(response.status).toEqual(200);
    });

    it('successfully broker POST with 2nd client when 1st client was closed', async () => {
      await closeBrokerClient(bcFirst);

      const response = await axiosClient.post(
        `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
        { echo: 'body' },
      );

      expect(response.status).toEqual(200);
    });
  });
});
