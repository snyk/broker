import * as request from 'request';
const compression = require('compression');
const webserver = require('../lib/webserver');
const express = require('express');

let p = 9876;

export function port() {
  return --p;
}

export function createTestServer(echoServerPort = port()) {
  // this is our fake local and private web server
  const { app: echoServer, server: testServer } = webserver({
    port: echoServerPort,
    httpsKey: process.env.TEST_KEY, // Optional
    httpsCert: process.env.TEST_CERT, // Optional
  });

  echoServer.use(compression());

  const echoServerRoutes = express();

  echoServerRoutes.get('/test', (req, res) => {
    res.status(200);
    res.send('All good');
  });

  echoServerRoutes.get('/test-blob/1', (req, res) => {
    res.setHeader('test-orig-url', req.originalUrl);
    res.status(299);

    const buf = Buffer.alloc(500);
    for (let i = 0; i < 500; i++) {
      buf.writeUInt8(i & 0xff, i);
    }
    res.send(buf);
  });

  echoServerRoutes.get('/test-blob/2', (req, res) => {
    res.setHeader('test-orig-url', req.originalUrl);
    res.status(500);
    res.send('Test Error');
  });

  echoServerRoutes.get('/test-blob-param/:param', (req, res) => {
    const size = parseInt(req.params.param, 10);
    res.status(200);
    const buf = Buffer.alloc(size);
    for (let i = 0; i < size; i++) {
      buf.writeUInt8(i & 0xff, i);
    }
    res.send(buf);
  });

  echoServerRoutes.get('/basic-auth', (req, res) => {
    res.send(req.headers.authorization);
  });

  echoServerRoutes.get('/echo-param/:param', (req, res) => {
    res.send(req.params.param);
  });

  echoServerRoutes.get('/echo-param-protected/:param', (req, res) => {
    res.send(req.params.param);
  });

  echoServerRoutes.post('/echo-body/:param?', (req, res) => {
    const contentType = req.get('Content-Type');
    if (contentType) {
      res.type(contentType);
    }
    res.send(req.body);
  });

  echoServerRoutes.post('/echo-headers/:param?', (req, res) => {
    res.json(req.headers);
  });

  echoServerRoutes.get('/echo-query/:param?', (req, res) => {
    res.json(req.query);
  });

  echoServerRoutes.get('/long/nested/*', (req, res) => {
    res.send(req.originalUrl);
  });

  echoServerRoutes.get(
    '/repos/owner/repo/contents/folder/package.json',
    (req, res) => {
      res.json({ headers: req.headers, query: req.query, url: req.url });
    },
  );

  echoServerRoutes.get('/huge-file', (req, res) => {
    res.json({ data: 'a '.repeat(10485761) });
  });

  echoServerRoutes.all('*', (req, res) => {
    res.send(false);
  });

  echoServer.use(['/snykgit', '/'], echoServerRoutes);

  return {
    echoServerPort,
    testServer,
  };
}

export function requestAsync(req) {
  return new Promise((resolve, reject) => {
    request(req, (error, res, body) => {
      if (!error) {
        resolve({ res, body });
      } else {
        reject({ error, res, body });
      }
    });
  });
}
