import express from 'express';
import request from 'supertest';
import { setRequestIdHeader } from '../../../../../../lib/hybrid-sdk/common/http/middleware/requestId';
import { isUUID } from '../../../../../../lib/hybrid-sdk/common/utils/uuid';

const setupApp = (opts?: Parameters<typeof setRequestIdHeader>[0]) => {
  const app = express();
  app.use(setRequestIdHeader(opts));
  app.get('/', (req, res) => res.send(req.requestId));
  return app;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('setRequestIdHeader middleware', () => {
  describe('each candidate header is accepted when set alone', () => {
    const cases: Array<[string, string]> = [
      ['x-akamai-request-id', '11111111-1111-4111-8111-111111111111'],
      ['x-request-id', '22222222-2222-4222-8222-222222222222'],
      ['snyk-request-id', '33333333-3333-4333-8333-333333333333'],
      ['x-github-delivery', '44444444-4444-4444-8444-444444444444'],
      ['x-gitlab-event-uuid', '55555555-5555-4555-8555-555555555555'],
    ];

    test.each(cases)(
      '%s: supplied UUID is used as-is (response body and snyk-request-id header match)',
      async (headerName, uuid) => {
        const res = await request(setupApp()).get('/').set(headerName, uuid);

        expect(res.status).toEqual(200);
        expect(res.text).toEqual(uuid);
        expect(res.headers['snyk-request-id']).toEqual(uuid);
      },
    );
  });

  describe('candidate header priority order', () => {
    // Each case sets all headers from the current index onwards, asserting
    // the header at that index wins over all lower-priority ones.
    const headers: Array<[string, string]> = [
      ['x-akamai-request-id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      ['x-request-id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      ['snyk-request-id', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
      ['x-github-delivery', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'],
      ['x-gitlab-event-uuid', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'],
    ];

    test.each(headers)(
      '%s wins over all lower-priority headers',
      async (winnerName, winnerUuid) => {
        const winnerIndex = headers.findIndex(([h]) => h === winnerName);
        const lowerHeaders = headers.slice(winnerIndex + 1);

        const req = request(setupApp()).get('/').set(winnerName, winnerUuid);
        for (const [name, uuid] of lowerHeaders) {
          req.set(name, uuid);
        }

        const res = await req;
        expect(res.text).toEqual(winnerUuid);
      },
    );
  });

  it('skips an invalid UUID in a higher-priority header and uses the next valid one', async () => {
    const valid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const res = await request(setupApp())
      .get('/')
      .set('x-akamai-request-id', 'not-a-uuid')
      .set('x-request-id', valid);

    expect(res.text).toEqual(valid);
  });

  it('rejects a non-UUID value and falls back to a fresh UUID', async () => {
    const res = await request(setupApp())
      .get('/')
      .set('snyk-request-id', 'not-a-uuid');

    expect(res.text).not.toEqual('not-a-uuid');
    expect(isUUID(res.text)).toBe(true);
  });

  it('rejects the nil UUID and falls back to a fresh UUID', async () => {
    const nil = '00000000-0000-0000-0000-000000000000';
    const res = await request(setupApp()).get('/').set('snyk-request-id', nil);

    expect(res.text).not.toEqual(nil);
    expect(isUUID(res.text)).toBe(true);
  });

  it('generates a UUID when no candidate headers are present', async () => {
    const res = await request(setupApp()).get('/');

    expect(isUUID(res.text)).toBe(true);
    expect(res.headers['snyk-request-id']).toEqual(res.text);
  });

  it('always sets snyk-request-id response header to a valid UUID', async () => {
    const res = await request(setupApp()).get('/');

    expect(isUUID(res.headers['snyk-request-id'])).toBe(true);
  });

  it('uses a custom responseHeader when configured', async () => {
    const res = await request(setupApp({ responseHeader: 'x-custom' })).get(
      '/',
    );

    expect(isUUID(res.headers['x-custom'])).toBe(true);
    expect(res.headers['snyk-request-id']).toBeUndefined();
  });

  it('uses only custom incomingHeaders when configured', async () => {
    const snykUuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const customUuid = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    const res = await request(setupApp({ incomingHeaders: ['x-only-this'] }))
      .get('/')
      .set('snyk-request-id', snykUuid)
      .set('x-only-this', customUuid);

    expect(res.text).toEqual(customUuid);
  });

  it('forwards the error to Express and logs at error level when randomUUID throws', async () => {
    // jest.spyOn cannot intercept named imports after module load, so we
    // reload the middleware inside an isolated module scope where crypto is
    // mocked before the import resolves. The logger spy must also come from
    // the isolated registry — the middleware uses its own fresh logger instance.
    let appUnderTest!: express.Express;
    let warnSpy!: jest.SpyInstance;

    jest.isolateModules(() => {
      jest.mock('crypto', () => ({
        ...jest.requireActual('crypto'),
        randomUUID: () => {
          throw new Error('boom');
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        log: isolatedLogger,
      } = require('../../../../../../lib/logs/logger');
      warnSpy = jest.spyOn(isolatedLogger, 'error');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const {
        setRequestIdHeader: isolated,
      } = require('../../../../../../lib/hybrid-sdk/common/http/middleware/requestId');
      appUnderTest = express();
      appUnderTest.use(isolated());
      appUnderTest.get('/', (req, res) => res.send(req.requestId));
    });

    const res = await request(appUnderTest).get('/');

    expect(res.status).toEqual(500);
    expect(warnSpy).toHaveBeenCalledWith(
      { error: expect.any(Error) },
      'Failed to set request ID.',
    );
  });
});
