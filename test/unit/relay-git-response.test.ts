jest.mock('request');
import * as request from 'request';
import { mocked } from 'ts-jest/utils';
import { response as relay } from '../../lib/relay-git';

const requestMock = mocked(request);
const postponeDone = (expectedCalls: number, done: Function) => {
  let _numCalls = 0;
  return () => {
    _numCalls++;
    if (_numCalls >= expectedCalls) done();
  }
}

describe('body relay', () => {
  it('relay requests to git client clearing headers', (done) => {
    expect.hasAssertions();

    const responseStatus = 200;
    const responseBody = 'ok';
    requestMock.mockImplementationOnce((_options, fn) => {
      fn!(null, { statusCode: responseStatus } as any, responseBody);
      return {} as any;
    });
    
    const url = '/';
    const headers = {
      'x-forwarded-for': 'test',
      'x-forwarded-proto': 'test',
      'content-length': 'test',
      'host': 'test',
      'accept-encoding': 'test',
      'Content-Type': 'text/html; charset=UTF-8',
    };
    const body = 'test body';
    const brokerToken = '';
    const config = {
      GIT_CLIENT_URL: 'http://localhost:8001',
      GIT_URL: 'scm.scm',
      GIT_USERNAME: 'user',
      GIT_PASSWORD: 'pass',
    };

    const route = relay(config)(brokerToken);

    route(
      { url, method: 'POST', body, headers },
      ({ status: resStatus, body: resBody }) => {
        expect(requestMock).toHaveBeenCalledTimes(1);
        const arg = requestMock.mock.calls[0][0];
        expect((arg as any).url).toEqual(`${config.GIT_CLIENT_URL}${url}`);
        expect(arg.body).toEqual(body);
        expect(arg.headers).toEqual({
          'Content-Type': 'text/html; charset=UTF-8',
        });
        expect(resStatus).toEqual(responseStatus);
        expect(resBody).toEqual(responseBody);
        done();
      },
    );
  });

  it('relay analyze request injecting credentials', (done) => {
    expect.hasAssertions();

    const responseStatus = 200;
    const responseBody = { ok: true };
    const responseHeaders = { 'Content-Type': 'application/json' };
    const mocked = (_options, fn) => {
      fn!(
        null,
        {
          statusCode: responseStatus,
          headers: responseHeaders
        } as any,
        JSON.stringify(responseBody),
      );
      return {} as any;
    };
    requestMock.mockImplementationOnce(mocked).mockImplementationOnce(mocked);
    
    const url = '/bundle';
    const headers = { 'Content-Type': 'application/json' };
    const body1 = JSON.stringify({ key: { gitURI: 'ftp://wrong.url/owner/repo' } });
    const body2 = JSON.stringify({ key: { gitURI: '/owner/repo' } });
    const brokerToken = '';
    const config = {
      GIT_CLIENT_URL: 'http://localhost:8001',
      GIT_URL: 'scm.scm',
      GIT_USERNAME: 'user',
      GIT_PASSWORD: 'pass',
    };

    const route = relay(config)(brokerToken);
    const tryDone = postponeDone(2, done);
    route(
      { url, method: 'POST', body: body1, headers },
      ({ status: resStatus, body: resBody, headers: resHeaders }) => {
        expect(requestMock).toHaveBeenCalledTimes(2);
        const arg = requestMock.mock.calls[1][0];
        expect((arg as any).url).toEqual(`${config.GIT_CLIENT_URL}${url}`);
        expect(JSON.parse(arg.body).key.gitURI).toEqual(`ftp://${config.GIT_URL}/owner/repo`);
        expect(JSON.parse(arg.body).key.creds.username).toEqual(config.GIT_USERNAME);
        expect(JSON.parse(arg.body).key.creds.password).toEqual(config.GIT_PASSWORD);
        expect(arg.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(resStatus).toEqual(responseStatus);
        expect(JSON.parse(resBody)).toEqual(responseBody);
        expect(resHeaders).toEqual(responseHeaders);
        tryDone();
      },
    );
    route(
      { url, method: 'POST', body: body2, headers },
      ({ status: resStatus, body: resBody, headers: resHeaders }) => {
        expect(requestMock).toHaveBeenCalledTimes(3);
        const arg = requestMock.mock.calls[2][0];
        expect((arg as any).url).toEqual(`${config.GIT_CLIENT_URL}${url}`);
        expect(JSON.parse(arg.body).key.gitURI).toEqual(`https://${config.GIT_URL}/owner/repo`);
        expect(JSON.parse(arg.body).key.creds.username).toEqual(config.GIT_USERNAME);
        expect(JSON.parse(arg.body).key.creds.password).toEqual(config.GIT_PASSWORD);
        expect(arg.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(resStatus).toEqual(responseStatus);
        expect(JSON.parse(resBody)).toEqual(responseBody);
        expect(resHeaders).toEqual(responseHeaders);
        tryDone();
      },
    );
  });

  it('relay failed requests correctly', (done) => {
    expect.hasAssertions();

    const responseStatus = 400;
    const responseBody = { ok: false };
    const responseHeaders = { 'Content-Type': 'application/json' };
    requestMock.mockImplementationOnce((_options, fn) => {
      fn!(
        null,
        {
          statusCode: responseStatus,
          headers: responseHeaders
        } as any,
        JSON.stringify(responseBody),
      );
      return {} as any;
    });
    
    const url = '/';
    const headers = {};
    const body = 'test';
    const brokerToken = '';
    const config = {
      GIT_CLIENT_URL: 'http://localhost:8001',
      GIT_URL: 'scm.scm',
      GIT_USERNAME: 'user',
      GIT_PASSWORD: 'pass',
    };

    const route = relay(config)(brokerToken);

    route(
      { url, method: 'GET', body, headers },
      ({ status: resStatus, body: resBody, headers: resHeaders }) => {
        expect(requestMock).toHaveBeenCalledTimes(4);
        expect(resStatus).toEqual(responseStatus);
        expect(JSON.parse(resBody)).toEqual(responseBody);
        expect(resHeaders).toEqual(responseHeaders);
        done();
      },
    );
  });

  it('fails gracefully when config is wrong', (done) => {
    expect.hasAssertions();

    const responseStatus = 200;
    const responseBody = 'ok';
    requestMock.mockImplementationOnce((_options, fn) => {
      fn!(null, { statusCode: responseStatus } as any, responseBody);
      return {} as any;
    });
    
    const url = '/';
    const headers = {};
    const body = 'test body';

    const testRelay = (_config, _brokerToken) => {
      return relay(_config)(_brokerToken);
    };
    const tryDone = postponeDone(3, done);

    testRelay({}, 'broker')(
      { url, method: 'POST', body, headers },
      ({ status: resStatus, body: resBody }) => {
        // no request to git client should be triggered
        expect(requestMock).toHaveBeenCalledTimes(4);
        expect(resStatus).toEqual(500);
        expect(resBody).toEqual('NO_GIT_CLIENT_ON_BROKER_SERVER');
        tryDone();
      },
    );
    testRelay({}, undefined)(
      { url, method: 'POST', body, headers },
      ({ status: resStatus, body: resBody }) => {
        // no request to git client should be triggered
        expect(requestMock).toHaveBeenCalledTimes(4);
        expect(resStatus).toEqual(500);
        expect(resBody).toEqual('MISSING_GIT_CLIENT_URL');
        tryDone();
      },
    );
    testRelay({ GIT_CLIENT_URL: 'something' }, '')(
      { url, method: 'POST', body, headers },
      ({ status: resStatus, body: resBody }) => {
        // no request to git client should be triggered
        expect(requestMock).toHaveBeenCalledTimes(4);
        expect(resStatus).toEqual(500);
        expect(resBody).toEqual('MISSING_GIT_SERVER_CONFIG');
        tryDone();
      },
    );
  });
});
