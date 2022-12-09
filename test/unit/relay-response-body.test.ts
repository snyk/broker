jest.mock('request');
import * as request from 'request';
import { mocked } from 'ts-jest/utils';
import { response as relay } from '../../lib/relay';

describe('body relay', () => {
  it('relay swaps body values found in BROKER_VAR_SUB', (done) => {
    expect.hasAssertions();
    const requestMock = mocked(request);

    requestMock.mockImplementationOnce((_options, fn) => {
      fn!(null, { statusCode: 200 } as any, {});
      return {} as any;
    });

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
});
