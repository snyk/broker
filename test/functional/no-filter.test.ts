import axios from 'axios';

const app = require('../../lib');
import { createUtilServer, UtilServer } from '../utils';

describe('no filters broker', () => {
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
        accept: '',
      },
    });

    client = await app.main({
      port: 9873,
      client: 'client',
      config: {
        brokerServerUrl: `http://localhost:${serverPort}`,
        brokerToken: '12345',
        accept: '',
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

  it.skip('successfully broker with no filter should reject', async () => {
    const url = `http://localhost:${serverPort}/broker/${brokerToken}/echo-body`;
    const response = await axios.post(
      url,
      { test: 'body' },
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );

    expect(response.status).toEqual(401);
    expect(response.data).not.toBe({
      message: 'blocked',
      reason: 'Request does not match any accept rule, blocking HTTP request',
      url: '/echo-server',
    });
  });
});
