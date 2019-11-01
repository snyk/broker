// process.stdout.write('\033c'); // clear the screen
const tap = require('tap');
const test = require('tap-only');
const path = require('path');
const request = require('request');
const app = require('../../lib');
const version = require('../../lib/version');
const root = __dirname;

const { port, echoServerPort } = require('../utils')(tap);

test('proxy requests originating from behind the broker server', t => {
  /**
   * 1. start broker in server mode
   * 2. start broker in client mode and join (1)
   * 3. run local http server that replicates "private server"
   * 4. send requests to **server**
   *
   * Note: client is forwarding requests to echo-server defined in test/util.js
   */

  const ACCEPT = 'filters.json';
  process.env.ACCEPT = ACCEPT;

  process.chdir(path.resolve(root, '../fixtures/server'));
  process.env.BROKER_TYPE = 'server';
  const serverPort = port();
  const server = app.main({ port: serverPort });

  const clientRootPath = path.resolve(root, '../fixtures/client');
  process.chdir(clientRootPath);
  const BROKER_SERVER_URL = `http://localhost:${serverPort}`;
  const BROKER_TOKEN = '98f04768-50d3-46fa-817a-9ee6631e9970';
  process.env.BROKER_TYPE = 'client';
  process.env.GITHUB = 'github.com';
  process.env.BROKER_TOKEN = BROKER_TOKEN;
  process.env.BROKER_SERVER_URL = BROKER_SERVER_URL;
  process.env.ORIGIN_PORT = echoServerPort;
  process.env.USERNAME = 'user@email.com';
  process.env.PASSWORD = 'aB}#/:%40*1';
  const client = app.main({ port: port() });

  // wait for the client to successfully connect to the server and identify itself
  server.io.on('connection', socket => {
    socket.on('identify', clientData => {
      const token = clientData.token;
      t.plan(24);

      t.test('identification', t => {
        const filters = require(`${clientRootPath}/${ACCEPT}`);
        t.equal(clientData.token, BROKER_TOKEN, 'correct token');
        t.deepEqual(clientData.metadata, {
          version,
          filters,
        }, 'correct metadata');
        t.end();
      });

      t.test('successfully broker POST', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
        const body = { some: { example: 'json' }};
        request({ url, method: 'post', json: true, body }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, body, 'body brokered');
          t.end();
        });
      });

      t.test('successfully broker exact bytes of POST body', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
        // stringify the JSON unusually to ensure an unusual exact body
        const body = Buffer.from(
          JSON.stringify({ some: { example: 'json' }}, null, 5)
        );
        const headers = { 'Content-Type': 'application/json' };
        request({ url, method: 'post', headers, body }, (err, res) => {
          const responseBody = Buffer.from(res.body);
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(responseBody, body, 'body brokered exactly');
          t.end();
        });
      });

      t.test('successfully broker GET', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-param/xyz`;
        request({ url, method: 'get' }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(res.body, 'xyz', 'body brokered');
          t.end();
        });
      });

      // the variable substitution takes place in the broker client
      t.test('variable subsitution', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body`;
        const body = {
          BROKER_VAR_SUB: ['swap.me'],
          swap: { me: '${BROKER_TYPE}:${BROKER_TOKEN}' },
        };
        request({ url, method: 'post', json: true, body }, (err, res) => {
          const swappedBody = {
            BROKER_VAR_SUB: ['swap.me'],
            swap: { me: `client:${token}` },
          };
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, swappedBody, 'body brokered');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('block request for non-whitelisted url', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/not-allowed`;
        request({ url, 'method': 'post', json: true }, (err, res, body) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.equal(body.message, 'blocked', '"blocked" body: ' + body);
          t.equal(body.reason, 'Response does not match any accept rule, blocking websocket request', 'Block message');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('allow request for valid url with valid body', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body/filtered`;
        const body = { proxy: { me: 'please' }};
        request({ url, method: 'post', json: true, body }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, body, 'body brokered');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('block request for valid url with invalid body', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-body/filtered`;
        const body = { proxy: { me: 'now!' }};
        request({ url, 'method': 'post', json: true, body }, (err, res, body) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.equal(body.message, 'blocked', '"blocked" body: ' + body);
          t.equal(body.reason, 'Response does not match any accept rule, blocking websocket request', 'Block message');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('allow request for valid url with valid query param', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-query/filtered`;
        const qs = { proxyMe: 'please' };
        request({ url, method: 'get', json: true, qs }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(res.body, qs, 'querystring brokered');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('block request for valid url with invalid query param', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-query/filtered`;
        const qs = { proxyMe: 'now!' };
        request({ url, 'method': 'get', qs }, (err, res) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.end();
        });
      });

      // the filtering happens in the broker client
      t.test('block request for valid url with missing query param', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-query/filtered`;
        request({ url, 'method': 'get' }, (err, res) => {
          t.equal(res.statusCode, 401, '401 statusCode');
          t.end();
        });
      });

      t.test('bad broker id', t => {
        const url = `http://localhost:${serverPort}/broker/${token}XXX/echo-body`;
        request({ url, 'method': 'post', json: true }, (err, res) => {
          t.equal(res.statusCode, 404, '404 statusCode');
          t.end();
        });
      });

      // don't leak broker tokens to systems on the client side
      t.test('broker token is not included in headers from client to private', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-headers`;
        request({ url, method: 'post' }, (err, res) => {
          const responseBody = JSON.parse(res.body);
          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(responseBody['x-broker-token'], undefined, 'X-Broker-Token header not sent');
          t.end();
        });
      });

      t.test('querystring parameters are brokered', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/` +
                'echo-query?shape=square&colour=yellow&' +
                'url_as_param=https%3A%2F%2Fclojars.org%2Fsearch%3Fq%3Dbtc&' +
                'one_more_top_level_param=true';
        request({ url, method: 'get' }, (err, res) => {
          const responseBody = JSON.parse(res.body);
          t.equal(res.statusCode, 200, '200 statusCode');
          t.same(responseBody, {
            shape: 'square', colour: 'yellow',
            url_as_param: 'https://clojars.org/search?q=btc', // eslint-disable-line
            one_more_top_level_param: 'true', // eslint-disable-line
          },
          'querystring brokered');
          t.end();
        });
      });

      t.test('approved URLs are blocked when escaped',
        t => {
          const url = `http://localhost:${serverPort}/broker/${token}/` +
                       'long/nested%2Fpath%2Fto%2Ffile.ext';
          request({ url, method: 'get', json: true }, (err, res) => {
            t.equal(res.statusCode, 401, '401 statusCode');
            t.equal(res.body.message, 'blocked', 'Block message');
            t.equal(res.body.reason, 'Response does not match any accept rule, blocking websocket request', 'Block message');
            t.end();
          });
        });

      t.test('approved URLs are brokered when escaped as expected',
        t => {
          const url = `http://localhost:${serverPort}/broker/${token}/` +
                       'long/nested/partially/encoded%2Fpath%2Fto%2Ffile.ext';
          request({ url, method: 'get' }, (err, res) => {
            t.equal(res.statusCode, 200, '200 statusCode');
            t.equal(res.body, '/long/nested/partially/encoded%2Fpath%2Fto%2Ffile.ext', 'proper brokered URL');
            t.end();
          });
        });

      t.test('content-length is not set when using chunked http', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-headers`;
        request({ url, method: 'get',
          headers: [{'Transfer-Encoding': 'chunked'}] }, (err, res) => {
          t.notOk(res.headers['Content-Length'], 'no content-length header');
          t.end();
        });
      });

      t.test('content-length is set without chunked http', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-headers`;
        request({ url, method: 'post'}, (err, res) => {
          t.ok(res.headers['content-length'], 'found content-length header');
          t.end();
        });
      });

      t.test('auth header is replaced when url contains token', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-headers/github`;
        const headers = {Authorization: 'broker auth'};
        request({ url, method: 'post', headers }, (err, res) => {
          const responseBody = JSON.parse(res.body);
          t.equal(res.statusCode, 200, '200 statusCode');
          t.equal(responseBody.authorization, 'token githubToken',
            'auth header was replaced by github token');
          t.end();
        });
      });

      t.test('auth header is is replaced when url contains basic auth', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/echo-headers/bitbucket`;
        const headers = {};
        request({ url, method: 'post', headers }, (err, res) => {
          const responseBody = JSON.parse(res.body);
          t.equal(res.statusCode, 200, '200 statusCode');
          const auth = responseBody.authorization.replace('Basic ', '');
          const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
          t.equal(encodedAuth, 'bitbucketUser:bitbucketPassword',
            'auth header is set correctly');
          t.end();
        });
      });

      t.test('successfully broker on endpoint that forwards requests with basic auth', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/basic-auth`;
        request({ url, method: 'get' }, (err, res) => {
          t.equal(res.statusCode, 200, '200 statusCode');

          const auth = res.body.replace('Basic ', '');
          const encodedAuth = Buffer.from(auth, 'base64').toString('utf-8');
          t.equal(encodedAuth, `${process.env.USERNAME}:${process.env.PASSWORD}`,
            'auth header is set correctly');
          t.end();
        });
      });

      t.test('successfully stream data', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/test-blob/1`;
        request({
          url,
          method: 'get',
          encoding: null
        }, (err, res, body) => {

          // No encoding is only possible when streaming
          // data as we otherwise encode the data
          // when making the request on the client.

          t.equal(res.statusCode, 299, '299 statusCode');
          t.equal(res.headers['test-orig-url'],
            '/test-blob/1', 'orig URL');

          // Check that the server response with the correct data

          const buf = new Buffer(500);
          for (var i=0; i<500; i++) {
            buf.writeUInt8(i & 0xFF, i);
          }
          t.deepEqual(body, buf);

          t.end();
        });
      });

      t.test('fail to stream data', t => {
        const url = `http://localhost:${serverPort}/broker/${token}/test-blob/2`;
        request({
          url,
          method: 'get',
          encoding: null
        }, (err, res, body) => {
          t.equal(res.statusCode, 500, '500 statusCode');
          t.equal(res.headers['test-orig-url'],
            '/test-blob/2', 'orig URL');
          t.equal(String(body), 'Test Error');
          t.end();
        });
      });

      t.test('clean up', t => {
        client.close();
        setTimeout(() => {
          server.close();
          t.ok('sockets closed');
          t.end();
        }, 100);
      });
    });
  });
});
