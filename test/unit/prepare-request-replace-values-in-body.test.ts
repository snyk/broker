import { ClientOpts } from '../../lib/client/types/client';
import { TestResult } from '../../lib/common/filter/filtersAsync';
import { prepareRequestFromFilterResult } from '../../lib/common/relay/prepareRequest';
import { LogContext } from '../../lib/common/types/log';
import { ServerOpts } from '../../lib/server/types/http';

describe('body values replacement', () => {
  it('prepareRequest swaps body values found in BROKER_VAR_SUB', async () => {
    const brokerToken = 'test-broker';

    const config = {
      HOST: 'localhost',
      PORT: '8001',
    };
    const options: ClientOpts | ServerOpts = {
      filters: {
        private: [
          {
            method: 'any',
            url: '/*',
            origin: `http://${config.HOST}:${config.PORT}`, // origin is required in Rule for clients
          },
        ],
        public: [],
      },
      config,
      port: 8001,
    };

    const body = {
      BROKER_VAR_SUB: ['valueInBody'],
      valueInBody: '${HOST}:${PORT}/webhook',
    };

    const payload = {
      method: 'POST',
      url: 'http://localhost:8001/',
      headers: {},
      body: JSON.stringify(body),
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

    expect(JSON.parse(`${req.body}`)['valueInBody']).toEqual(
      `${config.HOST}:${config.PORT}/webhook`,
    );
    expect(error).toBeNull();
  });

  it('prepapre does NOT swap body values found in BROKER_VAR_SUB if disable', async () => {
    const brokerToken = 'test-broker';

    const config = {
      HOST: 'localhost',
      PORT: '8001',
      disableBodyVarsSubstitution: true,
    };
    const options: ClientOpts | ServerOpts = {
      filters: {
        private: [
          {
            method: 'any',
            url: '/*',
            origin: `http://${config.HOST}:${config.PORT}`, // origin is required in Rule for clients
          },
        ],
        public: [],
      },
      config,
      port: 8001,
    };

    const body = {
      BROKER_VAR_SUB: ['valueInBody'],
      valueInBody: '${HOST}:${PORT}/webhook',
    };

    const payload = {
      method: 'POST',
      url: 'http://localhost:8001/',
      headers: {},
      body: JSON.stringify(body),
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
      'server',
    );

    expect(JSON.parse(`${req.body}`)['valueInBody']).toEqual(
      '${HOST}:${PORT}/webhook',
    );
    expect(error).toBeNull();
  });
});
