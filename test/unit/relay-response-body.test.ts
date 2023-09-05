jest.mock('request');
import request from 'request';

const requestDefaultsMock = jest.mocked(request.defaults, true);
const requestMock = jest.fn((req, fn) => {
  fn!(null, { statusCode: 200 } as any, {});
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
requestDefaultsMock.mockImplementation((_options) => {
  return requestMock;
});

import { forwardWebSocketRequest as relay } from '../../lib/common/relay';

describe('body relay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('relay swaps body values found in BROKER_VAR_SUB', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      HOST: 'localhost',
      PORT: '8001',
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

    const body = {
      BROKER_VAR_SUB: ['url'],
      url: '${HOST}:${PORT}/webhook',
    };

    route(
      {
        url: '/',
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        body: Buffer.from(JSON.stringify(body)),
        headers: {},
      },
      () => {
        expect(requestMock).toHaveBeenCalledTimes(1);
        const arg = requestMock.mock.calls[0][0];
        expect(JSON.parse(arg.body).url).toEqual(
          `${config.HOST}:${config.PORT}/webhook`,
        );

        done();
      },
    );
  });

  it('relay does NOT swap body values found in BROKER_VAR_SUB if disabled', (done) => {
    expect.hasAssertions();

    const brokerToken = 'test-broker';

    const config = {
      HOST: 'localhost',
      PORT: '8001',
      disableBodyVarsSubstitution: true,
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

    const body = {
      BROKER_VAR_SUB: ['url'],
      url: '${HOST}:${PORT}/webhook',
    };

    route(
      {
        url: '/',
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        body: Buffer.from(JSON.stringify(body)),
        headers: {},
      },
      () => {
        expect(requestMock).toHaveBeenCalledTimes(1);
        const arg = requestMock.mock.calls[0][0];
        expect(JSON.parse(arg.body).url).toEqual('${HOST}:${PORT}/webhook');

        done();
      },
    );
  });
});
