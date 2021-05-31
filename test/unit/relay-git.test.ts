jest.mock('request');
import * as request from 'request';
import { mocked } from 'ts-jest/utils';
const requestMock = mocked(request);
import { request as relay } from '../../lib/relay-git';

describe('git relay', () => {
  it('relay requests clearing headers', (done) => {
    expect.hasAssertions();
    const config = {
      GIT_CLIENT_URL: 'http://localhost:8001',
      GIT_CLIENT_CREDENTIALS: 'user:pass',
    };
    const testBody = 'test';
    requestMock.mockImplementationOnce((req, fn) => {
      expect(req.body).toEqual(testBody);
      expect(req.headers).toEqual({
        'Content-Type': 'text/html; charset=UTF-8',
      });
      fn!(null, { statusCode: 200 } as any, testBody);
      return testBody as any;
    });

    const responseObject = {
      status: (status) => {
        expect(requestMock).toHaveBeenCalledTimes(1);
        expect(status).toEqual(200);
        return responseObject;
      },
      json: (body) => {
        fail(`Brokered body should be sent as it is (body=${body}).`);
      },
      send: (body) => {
        expect(body).toEqual(testBody);
        done();
      },
    }
    const route = relay(config);
    route(
      {
        url: '/test',
        method: 'POST',
        body: testBody,
        headers: {
          'x-forwarded-for': 'test',
          'x-forwarded-proto': 'test',
          'content-length': 'test',
          'host': 'test',
          'accept-encoding': 'test',
          'Content-Type': 'text/html; charset=UTF-8',
        },
      },
      responseObject
    );
  });

  it('relay analyze request injecting credentials', (done) => {
    expect.hasAssertions();
    const config = {
      GIT_CLIENT_URL: 'http://localhost:8001',
      GIT_CLIENT_CREDENTIALS: 'user:pass',
    };
    const requestHeaders = { 'Content-Type': 'application/json' };
    const requestBody = { url: 'http://scm.scm/owner/repo' };
    const responseBody = {
      state: {
        progress: { step: null, percentage: 1 },
        status: "done",
        bundleId: "some/bundle/id"
      }
    };

    requestMock.mockImplementationOnce((req, fn) => {
      expect(JSON.parse(req.body).url).toEqual(
        `http://${config.GIT_CLIENT_CREDENTIALS}@scm.scm/owner/repo`,
      );
      expect(req.headers).toEqual(requestHeaders);
      fn!(null, { statusCode: 200 } as any, responseBody);
      return responseBody as any;
    });

    const responseObject = {
      status: (status) => {
        expect(requestMock).toHaveBeenCalledTimes(2);
        expect(status).toEqual(200);
        return responseObject;
      },
      json: (body) => {
        fail(`Brokered body should be sent as it is (body=${body}).`);
      },
      send: (body) => {
        expect(body).toEqual(responseBody);
        done();
      },
    }
    const route = relay(config);
    route(
      {
        url: '/analyze',
        method: 'POST',
        body: Buffer.from(JSON.stringify(requestBody)),
        headers: requestHeaders,
      },
      responseObject
    );
  });

  it('relay failed requests correctly', (done) => {
    expect.hasAssertions();
    const config = {
      GIT_CLIENT_URL: 'http://localhost:8001',
      GIT_CLIENT_CREDENTIALS: 'user:pass',
    };
    const responseBody = { error: 'error test' };

    requestMock.mockImplementationOnce((req, fn) => {
      fn!(null, { statusCode: 400 } as any, responseBody);
      return responseBody as any;
    });

    const responseObject = {
      status: (status) => {
        expect(requestMock).toHaveBeenCalledTimes(3);
        expect(status).toEqual(400);
        return responseObject;
      },
      json: (body) => {
        fail(`Brokered body should be sent as it is (body=${body}).`);
      },
      send: (body) => {
        expect(body).toEqual(responseBody);
        done();
      },
    }
    const route = relay(config);
    route(
      {
        url: '/analyze',
        method: 'POST',
        headers: {},
      },
      responseObject
    );
  });

  it('fails gracefully when config is missing', (done) => {
    expect.hasAssertions();
    let expectedError = 'MISSING_GIT_CLIENT_URL';
    let ending = false;
    const responseBody = () => { return { error: expectedError }; };
    const responseObject = {
      status: (status) => {
        expect(status).toEqual(500);
        return responseObject;
      },
      json: (body) => {
        expect(body).toEqual(responseBody());
        if (ending) done();
      },
      send: (body) => {
        fail(`Internal errors should be sent as json (body=${body}).`);
      },
    }
    const testRelay = (config) => {
      const route = relay(config);
      route(
        {
          url: '/analyze',
          method: 'POST',
          headers: {},
        },
        responseObject
      );
    };
    testRelay({ GIT_CLIENT_CREDENTIALS: 'user:pass' });
    expectedError = 'MISSING_GIT_CLIENT_CREDENTIALS';
    ending = true;
    testRelay({ GIT_CLIENT_URL: 'http://localhost:8001' });
    expect(requestMock).toHaveBeenCalledTimes(3);
  });
});
