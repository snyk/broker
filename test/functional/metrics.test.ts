// awkward require from '../utils' on '../../lib/config'
// means we have to assign a port and set env here *before* importing
const originPort = 9877;
process.env.ORIGIN_PORT = `${originPort}`;

import * as path from 'path';
import * as app from '../../lib';
import * as metrics from '../../lib/metrics';
import { createTestServer, requestAsync, port } from '../utils';

const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('metrics', () => {
  let client;
  let server;
  let serverPort;
  let utilServer;
  let brokerToken;

  beforeAll((done) => {
    const { testServer } = createTestServer(originPort);
    utilServer = testServer;
    serverPort = port();
    server = app.main({
      port: serverPort,
      client: undefined,
      config: {
        accept: serverAccept,
      },
    });
    client = app.main({
      port: port(),
      client: 'artifactory',
      config: {
        accept: clientAccept,
        brokerServerUrl: `http://localhost:${serverPort}`,
        brokerToken: '98f04768-50d3-46fa-817a-9ee6631e9970',
        artifactoryUrl: `http://localhost:${originPort}`,
      },
    });

    // wait for server <> client connection
    server.io.on('connection', (socket) => {
      socket.on('identify', ({ token }) => {
        brokerToken = token;
        done();
      });
    });
  });

  afterAll(() => {
    utilServer.close();
    client.close();
    server.close();
  });

  afterEach(() => jest.resetAllMocks());

  it('observes response size when streaming', async () => {
    const metricsSpy = jest.spyOn(metrics, 'observeResponseSize');
    const expectedBytes = 256_000; // 250kb
    await requestAsync({
      url: `http://localhost:${serverPort}/broker/${brokerToken}/test-blob-param/${expectedBytes}`,
      method: 'get',
    });
    expect(metricsSpy).toHaveBeenCalledWith({
      bytes: expectedBytes,
      isStreaming: true,
    });
  });
});
