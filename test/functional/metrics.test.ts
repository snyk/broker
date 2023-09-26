import path from 'path';
import * as metrics from '../../lib/common/utils/metrics';
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
    ({ brokerToken } = await waitForBrokerClientConnection(bs));
  });

  afterAll(async () => {
    await tws.server.close();
    await closeBrokerClient(bc);
    await closeBrokerServer(bs);
  });

  it('observes response size when streaming', async () => {
    const metricsSpy = jest.spyOn(metrics, 'observeResponseSize');
    const expectedBytes = 256_000; // 250kb

    await axiosClient.get(
      `http://localhost:${bs.port}/broker/${brokerToken}/test-blob-param/${expectedBytes}`,
      { timeout: 10_000 },
    );

    expect(metricsSpy).toHaveBeenCalledWith({
      bytes: expectedBytes,
      isStreaming: true,
    });
  });
});
