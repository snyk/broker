import http from 'http';
import https from 'https';
import net from 'net';
import { initGlobalProxy } from '../../../lib/hybrid-sdk/common/utils/proxy';

const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
];

// A caller that sets its own agent must still be routed through the proxy;
// otherwise proxied environments silently lose connectivity.
describe('initGlobalProxy makes explicit-agent https requests tunnel via the proxy', () => {
  let proxy: http.Server;
  let proxyPort: number;
  const connectTargets: string[] = [];
  const openSockets = new Set<net.Socket>();

  // Captured pristine so afterAll can undo the global patching and not leak it
  // into sibling test files.
  const orig = {
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
    httpAgent: http.globalAgent,
    httpsAgent: https.globalAgent,
  };
  let savedEnv: Record<string, string | undefined>;

  beforeAll((done) => {
    savedEnv = {};
    for (const k of PROXY_ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    proxy = http.createServer();
    proxy.on('connection', (socket) => {
      openSockets.add(socket);
      socket.on('close', () => openSockets.delete(socket));
    });
    proxy.on('connect', (req, socket) => {
      connectTargets.push(req.url ?? '');
      // We only care that the CONNECT reached the proxy.
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.destroy();
    });
    proxy.listen(0, '127.0.0.1', () => {
      proxyPort = (proxy.address() as net.AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    (http as any).request = orig.httpRequest;
    (http as any).get = orig.httpGet;
    (https as any).request = orig.httpsRequest;
    (https as any).get = orig.httpsGet;
    http.globalAgent = orig.httpAgent;
    https.globalAgent = orig.httpsAgent;
    delete (global as any).GLOBAL_AGENT;
    for (const k of PROXY_ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    for (const socket of openSockets) socket.destroy();
    proxy.close(() => done());
  });

  it('sends a CONNECT for the target host to the configured proxy', async () => {
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;

    initGlobalProxy('https://api.test.local');

    await new Promise<void>((resolve) => {
      const req = https.request(
        'https://api.test.local/oauth2/token',
        { method: 'POST', agent: new https.Agent({ maxSockets: Infinity }) },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      req.setTimeout(3000, () => {
        req.destroy();
        resolve();
      });
      req.on('error', () => resolve());
      req.end();
    });

    expect(connectTargets).toContain('api.test.local:443');
  });
});
