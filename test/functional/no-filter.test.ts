import axios from 'axios';

const app = require('../../lib');
import { createUtilServer, port, UtilServer } from '../utils';

describe('no filters broker', () => {
  let client, server, serverPort;
  let utilServer: UtilServer;
  let brokerToken;

  beforeAll(async () => {
    utilServer = await createUtilServer();

    serverPort = port();
    server = await app.main({
      port: serverPort,
      client: undefined,
      config: {
        accept: '',
      },
    });

    client = await app.main({
      port: port(),
      client: undefined,
      config: {
        brokerServerUrl: `http://localhost:${serverPort}`,
        brokerToken: '12345',
        accept: '',
      },
    });
  });

  beforeEach((done) => {
    server.io.on('connection', (socket) => {
      socket.on('identify', ({ token }) => {
        brokerToken = token;
        done();
      });
    });
  });

  afterAll(async () => {
    await utilServer.httpServer.close();
    await client.close();
    setTimeout(async () => {
      await server.close();
    }, 100);
  });

  it('successfully broker with no filter should reject', async () => {
    const url = `http://localhost:${serverPort}/broker/${brokerToken}/echo-body`;
    const response = await axios.post(
      url,
      { test: 'body' },
      {
        validateStatus: () => true,
      },
    );

    expect(response.status).toBe(401);
    expect(response.data).not.toBe({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/echo-server',
    });
  });
});
