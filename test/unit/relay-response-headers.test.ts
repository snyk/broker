jest.mock('request');
import { mocked } from 'ts-jest/utils';
import * as request from 'request';

const requestDefaultsMock = mocked(request.defaults, true);
const requestMock = jest.fn((req, fn) => {
  fn!(null, { statusCode: 200 } as any, {});
});

// @ts-ignore
requestDefaultsMock.mockImplementation((_options) => {
  return requestMock;
});

import { response as relay } from '../../lib/relay';

describe('header relay', () => {
  it('swaps header values found in BROKER_VAR_SUB', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      SECRET_TOKEN: 'very-secret',
      VALUE: 'some-special-value',
    };

    const route = relay(
      [
        {
          method: 'any',
          url: '/*',
        },
      ],
      config,
    )(brokerToken);

    const headers = {
      'x-broker-var-sub': 'private-token,replaceme',
      donttouch: 'not to be changed ${VALUE}',
      'private-token': 'Bearer ${SECRET_TOKEN}',
      replaceme: 'replace ${VALUE}',
    };

    route(
      {
        url: '/',
        method: 'GET',
        headers: headers,
      },
      () => {
        expect(requestMock).toHaveBeenCalledTimes(1);
        const arg = requestMock.mock.calls[0][0];
        expect(arg.headers!['private-token']).toEqual(
          `Bearer ${config.SECRET_TOKEN}`,
        );
        expect(arg.headers!.replaceme).toEqual(`replace ${config.VALUE}`);
        expect(arg.headers!.donttouch).toEqual('not to be changed ${VALUE}');
        done();
      },
    );
  });
});
