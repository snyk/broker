// noinspection DuplicatedCode

import * as path from 'path';
import * as metrics from '../../lib/metrics';
import axios from 'axios';
import { BrokerClient, createBrokerClient } from '../setup/broker-client';
import { BrokerServer, createBrokerServer } from '../setup/broker-server';
import { TestWebServer, createTestWebServer } from '../setup/test-web-server';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('metrics', () => {
  let tws: TestWebServer;
  let bs: BrokerServer;
  let bc: BrokerClient;
  let brokerToken: string;

  beforeAll(async () => {
    tws = await createTestWebServer();

    bs = await createBrokerServer({ filters: serverAccept });

    bc = await createBrokerClient({
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
    await tws.server.close();
    setTimeout(async () => {
      await bc.client.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bc.client.io.on('close', () => {
        resolve();
      });
    });

    setTimeout(async () => {
      await bs.server.close();
    }, 100);
    await new Promise<void>((resolve) => {
      bs.server.io.on('close', () => {
        resolve();
      });
    });
  });

  it('observes response size when streaming', async () => {
    const metricsSpy = jest.spyOn(metrics, 'observeResponseSize');
    const expectedBytes = 256_000; // 250kb

    await axios.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/test-blob-param/${expectedBytes}`,
      {
        validateStatus: () => true,
      },
    );

    expect(metricsSpy).toHaveBeenCalledWith({
      bytes: expectedBytes,
      isStreaming: true,
    });
  });
});
