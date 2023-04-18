// noinspection DuplicatedCode

import axios from 'axios';
import * as path from 'path';
import { BrokerClient, createBrokerClient } from '../setup/broker-client';
import { BrokerServer, createBrokerServer } from '../setup/broker-server';
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

    bs = await createBrokerServer({ filters: serverAccept });
  });
  afterAll(async () => {
    await tws.server.close();

    setTimeout(async () => {
      await bs.server.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bs.server.io.on('close', () => {
        resolve();
      });
    });
  });

  describe('1st client', () => {
    beforeAll(async () => {
      bcFirst = await createBrokerClient({
        brokerServerUrl: `http://localhost:${bs.port}`,
        brokerToken: '12345',
        filters: clientAccept,
      });
      await new Promise((resolve) => {
        bs.server.io.on('connection', (socket) => {
          socket.on('identify', (clientData) => {
            brokerToken = clientData.token;
            resolve(brokerToken);
          });
        });
      });
    });
    afterAll(async () => {
      setTimeout(async () => {
        await bcFirst.client?.close();
      }, 100);
      await new Promise<void>((resolve) => {
        bcFirst.client?.io.on('close', () => {
          resolve();
        });
      });
    });

    it('successfully broker POST with 1st connected client', async () => {
      const response = await axios.post(
        `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
        { echo: 'body' },
        {
          timeout: 1000,
          validateStatus: () => true,
        },
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
      await new Promise((resolve) => {
        bs.server.io.on('connection', (socket) => {
          socket.on('identify', (clientData) => {
            brokerToken = clientData.token;
            resolve(brokerToken);
          });
        });
      });
    });
    afterAll(async () => {
      setTimeout(async () => {
        await bcFirst.client?.close();
      }, 100);
      await new Promise<void>((resolve) => {
        bcFirst.client?.io.on('close', () => {
          resolve();
        });
      });
      setTimeout(async () => {
        await bcSecond.client?.close();
      }, 100);
      await new Promise<void>((resolve) => {
        bcSecond.client?.io.on('close', () => {
          resolve();
        });
      });
    });

    it.skip('successfully broker POST with 2nd client', async () => {
      const response = await axios.post(
        `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
        { echo: 'body' },
        {
          timeout: 1000,
          validateStatus: () => true,
        },
      );

      expect(response.status).toEqual(200);
    });

    it.skip('successfully broker POST with 2nd client when 1st client was closed', async () => {
      setTimeout(async () => {
        await bcFirst.client?.close();
      }, 100);
      await new Promise<void>((resolve) => {
        bcFirst.client?.io.on('close', () => {
          resolve();
        });
      });

      const response = await axios.post(
        `http://localhost:${bs.port}/broker/${brokerToken}/echo-body`,
        { echo: 'body' },
        {
          timeout: 1000,
          validateStatus: () => true,
        },
      );

      expect(response.status).toEqual(200);
    });
  });
});
