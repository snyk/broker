import * as path from 'path';
import * as app from '../../lib';
import * as metrics from '../../lib/metrics';
import { createUtilServer, UtilServer } from '../utils';
import axios from 'axios';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('metrics', () => {
  let client, server, serverPort;
  let utilServer: UtilServer;
  let brokerToken;

  beforeAll(async () => {
    utilServer = await createUtilServer(9875);

    serverPort = 9874;
    server = await app.main({
      port: serverPort,
      client: undefined,
      config: {
        accept: serverAccept,
      },
    });

    client = await app.main({
      port: 9873,
      client: 'artifactory',
      config: {
        accept: clientAccept,
        brokerServerUrl: `http://localhost:${serverPort}`,
        brokerToken: '98f04768-50d3-46fa-817a-9ee6631e9970',
        artifactoryUrl: `http://localhost:9875`,
      },
    });

    await new Promise((resolve) => {
      server.io.on('connection', (socket) => {
        socket.on('identify', (clientData) => {
          brokerToken = clientData.token;
          resolve(brokerToken);
        });
      });
    });
  });

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(async () => {
    await utilServer.httpServer.close();
    await client.close();
    setTimeout(async () => {
      await server.close();
    }, 100);

    await new Promise<void>((resolve) => {
      server.io.on('close', () => {
        resolve();
      });
    });
  });

  it('observes response size when streaming', async () => {
    const metricsSpy = jest.spyOn(metrics, 'observeResponseSize');
    const expectedBytes = 256_000; // 250kb

    await axios.get(
      `http://localhost:${serverPort}/broker/${brokerToken}/test-blob-param/${expectedBytes}`,
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
