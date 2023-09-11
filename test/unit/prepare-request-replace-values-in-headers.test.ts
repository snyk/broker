import { ClientOpts } from '../../lib/client/types/client';
import { ServerOpts } from '../../lib/server/types/http';
import { TestResult } from '../../lib/common/filter/filtersAsync';
import { LogContext } from '../../lib/common/types/log';
import { prepareRequestFromFilterResult } from '../../lib/common/relay/prepareRequest';

describe('header values replacement', () => {
  it('swaps header values found in BROKER_VAR_SUB', async () => {
    const brokerToken = 'test-broker';

    const config = {
      SECRET_TOKEN: 'very-secret',
      VALUE: 'some-special-value',
    };
    const options: ClientOpts | ServerOpts = {
      filters: {
        private: [
          {
            method: 'any',
            url: '/*',
            origin: ``, // origin is required in Rule for clients
          },
        ],
        public: [],
      },
      config,
      port: 8001,
    };

    const headers = {
      'x-broker-var-sub': 'private-token,replaceme',
      donttouch: 'not to be changed ${VALUE}',
      'private-token': 'Bearer ${SECRET_TOKEN}',
      replaceme: 'replace ${VALUE}',
    };

    const payload = {
      method: 'POST',
      url: 'http://localhost:8001/',
      headers: headers,
      body: '{}',
    };
    const filterResponse: TestResult = {
      url: 'http://localhost:8001/',
      auth: {},
      stream: undefined,
    };
    const logContext: LogContext = {
      url: payload.url,
      requestMethod: payload.method,
      requestHeaders: {},
      requestId: '123',
      streamingID: '123',
      maskedToken: 'hidden',
      hashedToken: 'hashed',
      transport: 'server',
    };

    const { req, error } = await prepareRequestFromFilterResult(
      filterResponse,
      payload,
      logContext,
      options,
      brokerToken,
      'doesntmatter',
    );

    expect(req.headers!['private-token']).toEqual(
      `Bearer ${config.SECRET_TOKEN}`,
    );
    expect(req.headers['replaceme']).toEqual(`replace ${config.VALUE}`);
    expect(req.headers['donttouch']).toEqual('not to be changed ${VALUE}');

    expect(error).toBeNull();
  });

  it('does NOT swap header values found in BROKER_VAR_SUB', async () => {
    const brokerToken = 'test-broker';

    const config = {
      SECRET_TOKEN: 'very-secret',
      VALUE: 'some-special-value',
      disableHeaderVarsSubstitution: true,
    };
    const options: ClientOpts | ServerOpts = {
      filters: {
        private: [
          {
            method: 'any',
            url: '/*',
            origin: ``, // origin is required in Rule for clients
          },
        ],
        public: [],
      },
      config,
      port: 8001,
    };

    const headers = {
      'x-broker-var-sub': 'private-token,replaceme',
      donttouch: 'not to be changed ${VALUE}',
      'private-token': 'Bearer ${SECRET_TOKEN}',
      replaceme: 'replace ${VALUE}',
    };

    const payload = {
      method: 'POST',
      url: 'http://localhost:8001/',
      headers: headers,
      body: '{}',
    };
    const filterResponse: TestResult = {
      url: 'http://localhost:8001/',
      auth: {},
      stream: undefined,
    };
    const logContext: LogContext = {
      url: payload.url,
      requestMethod: payload.method,
      requestHeaders: {},
      requestId: '123',
      streamingID: '123',
      maskedToken: 'hidden',
      hashedToken: 'hashed',
      transport: 'server',
    };

    const { req, error } = await prepareRequestFromFilterResult(
      filterResponse,
      payload,
      logContext,
      options,
      brokerToken,
      'doesntmatter',
    );

    expect(req.headers['private-token']).toEqual('Bearer ${SECRET_TOKEN}');
    expect(req.headers['replaceme']).toEqual('replace ${VALUE}');
    expect(req.headers['donttouch']).toEqual('not to be changed ${VALUE}');

    expect(error).toBeNull();
  });
});
