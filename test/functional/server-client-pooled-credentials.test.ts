import axios from 'axios';
import { createUtilServer, UtilServer } from '../utils';

const path = require('path');
const app = require('../../lib');
const version = require('../../lib/version');
const fixtures = path.resolve(__dirname, '..', 'fixtures');
const serverAccept = path.join(fixtures, 'server', 'filters.json');
const clientAccept = path.join(fixtures, 'client', 'filters.json');

describe('proxy requests originating from behind the broker server with pooled credentials', () => {
  let client, server, serverPort;
  let utilServer: UtilServer;
  let brokerToken, metadata;

  process.env.ORIGIN_PORT = '9875';

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

    // process.env.BROKER_TYPE = 'client';
    // process.env.GITHUB = 'github.com';
    // process.env.BROKER_TOKEN = BROKER_TOKEN;
    // process.env.BROKER_SERVER_URL = BROKER_SERVER_URL;
    // process.env.ORIGIN_PORT = echoServerPort;
    // process.env.USERNAME = 'user@email.com';
    // process.env.PASSWORD = 'not-used';
    // process.env.PASSWORD1 = 'aB}#/:%40*1';
    // process.env.PASSWORD2 = 'aB}#/:%40*2';
    // process.env.PASSWORD_POOL = '$PASSWORD1, $PASSWORD2';
    // process.env.GITHUB_TOKEN_POOL = 'token1, token2';

    client = await app.main({
      port: 9873,
      client: 'client',
      config: {
        brokerServerUrl: `http://localhost:${serverPort}`,
        brokerToken: '98f04768-50d3-46fa-817a-9ee6631e9970',
        accept: clientAccept,
        username: 'user@email.com',
      },
    });

    await new Promise((resolve) => {
      server.io.on('connection', (socket) => {
        socket.on('identify', (clientData) => {
          brokerToken = clientData.token;
          metadata = clientData.metadata;
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

  it('identification', async () => {
    expect(brokerToken).toEqual('98f04768-50d3-46fa-817a-9ee6631e9970');

    const filters = require(clientAccept);

    expect(metadata).toMatchObject({
      capabilities: ['post-streams'],
      clientId: expect.any(String),
      filters: filters,
      preflightChecks: expect.any(Array),
      version,
    });
  });

  it('successfully broker on endpoint that forwards requests with basic auth, using first credential', async () => {
    const url = `http://localhost:${serverPort}/broker/${brokerToken}/basic-auth`;

    const response = await axios.get(url, {
      timeout: 1000,
      validateStatus: () => true,
    });
    expect(response.status).toEqual(200);

    //TODO(pavel): enable after solving config issues in tests
    // const auth = response.data.replace('Basic ', '');
    // const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
    // expect(encodedAuth).toEqual('user@email.com:aB}#/:%40*1');
  });

  it('successfully broker on endpoint that forwards requests with basic auth, using second credential', async () => {
    const url = `http://localhost:${serverPort}/broker/${brokerToken}/basic-auth`;

    const response = await axios.get(url, {
      timeout: 1000,
      validateStatus: () => true,
    });
    expect(response.status).toEqual(200);

    //TODO(pavel): enable after solving config issues in tests
    // const auth = response.data.replace('Basic ', '');
    // const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
    // expect(encodedAuth).toEqual('user@email.com:aB}#/:%40*2');
  });

  it('successfully broker on endpoint that forwards requests with basic auth, using first credential again', async () => {
    const url = `http://localhost:${serverPort}/broker/${brokerToken}/basic-auth`;

    const response = await axios.get(url, {
      timeout: 1000,
      validateStatus: () => true,
    });
    expect(response.status).toEqual(200);

    //TODO(pavel): enable after solving config issues in tests
    // const auth = response.data.replace('Basic ', '');
    // const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
    // expect(encodedAuth).toEqual('user@email.com:aB}#/:%40*1');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using first credential', async () => {
    const url = `http://localhost:${serverPort}/broker/${brokerToken}/echo-headers/github-token-in-origin`;

    const response = await axios.post(
      url,
      {},
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );
    expect(response.status).toEqual(200);

    //TODO(pavel): enable after solving config issues in tests
    // expect(response.data.authorization).toEqual(''token token2'');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using second credential', async () => {
    const url = `http://localhost:${serverPort}/broker/${brokerToken}/echo-headers/github-token-in-origin`;

    const response = await axios.post(
      url,
      {},
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );
    expect(response.status).toEqual(200);

    //TODO(pavel): enable after solving config issues in tests
    // expect(response.data.authorization).toEqual(''token token2'');
  });

  it('successfully broker on endpoint that forwards requests with token auth in origin, using first credential again', async () => {
    const url = `http://localhost:${serverPort}/broker/${brokerToken}/echo-headers/github-token-in-origin`;

    const response = await axios.post(
      url,
      {},
      {
        timeout: 1000,
        validateStatus: () => true,
      },
    );
    expect(response.status).toEqual(200);

    //TODO(pavel): enable after solving config issues in tests
    // expect(response.data.authorization).toEqual(''token token2'');
  });
});
