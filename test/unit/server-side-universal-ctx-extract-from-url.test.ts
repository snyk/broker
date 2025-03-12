import express, { Response, Request } from 'express';
import request from 'supertest';
import { extractPossibleContextFromHttpRequestToHeader } from '../../lib/hybrid-sdk/server/routesHandlers/httpRequestHandler';

const dummyMiddlewareForTest = async (req: Request, res: Response) => {
  const response = {
    url: req.url,
    headers: req.headers,
  };
  res.send(response);
};

describe('Testing ctx extraction logic from url', () => {
  it('Testing context less classic urls', async () => {
    const url =
      '/broker/0000000-0000-0000-0000-000000000000/path?myqs=test&my_qs2=test2';
    const app = express();
    app.all(
      '/broker/:token/*',
      extractPossibleContextFromHttpRequestToHeader,
      dummyMiddlewareForTest,
    );

    const response = await request(app).get(url);
    expect(response.body.url).toEqual(url);
    expect(response.body.headers['x-snyk-broker-context-id']).toBeUndefined;
  });

  it('Testing url with context', async () => {
    const url =
      '/broker/0000000-0000-0000-0000-000000000000/ctx/11111111-0000-0000-0000-000000000000/path?myqs=test&my_qs2=test2';
    const expectedUrl =
      '/broker/0000000-0000-0000-0000-000000000000/path?myqs=test&my_qs2=test2';
    const app = express();
    app.all(
      '/broker/:token/*',
      extractPossibleContextFromHttpRequestToHeader,
      dummyMiddlewareForTest,
    );

    const response = await request(app).get(url);
    expect(response.body.url).toEqual(expectedUrl);
    expect(response.body.headers['x-snyk-broker-context-id']).toEqual(
      '11111111-0000-0000-0000-000000000000',
    );
  });
});
