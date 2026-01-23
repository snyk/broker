import { loadFilters } from '../../lib/hybrid-sdk/common/filter/filtersAsync';

const jsonBuffer = (body: unknown) => Buffer.from(JSON.stringify(body));

describe('filtersAsync loadFilters (method-optimized + regex caching)', () => {
  it('preserves rule priority within a method (unshift semantics) and ignores other methods', () => {
    const rules = [
      {
        '//': 'first GET rule should win',
        method: 'GET',
        path: '/repos/:name',
        origin: 'https://example.com',
      },
      {
        '//': 'second GET rule',
        method: 'GET',
        path: '/repos/:name',
        origin: 'https://example.com',
      },
    ] as any;

    const filter = loadFilters(rules, 'default', {});

    const match = filter({ url: '/repos/angular', method: 'GET' } as any);
    expect(match).not.toBe(false);
    expect((match as any)['//']).toBe('first GET rule should win');

    const miss = filter({ url: '/repos/angular', method: 'POST' } as any);
    expect(miss).toBe(false);
  });

  it('treats method=any as relevant to all supported HTTP methods', () => {
    const rules = [
      {
        '//': 'any method rule',
        method: 'any',
        path: '/any/:id',
        origin: 'https://example.com',
      },
    ] as any;

    const filter = loadFilters(rules, 'default', {});

    expect(filter({ url: '/any/1', method: 'GET' } as any)).not.toBe(false);
    expect(filter({ url: '/any/1', method: 'POST' } as any)).not.toBe(false);
    expect(filter({ url: '/any/1', method: 'PATCH' } as any)).not.toBe(false);
  });

  it('blocks when query filters exist but no querystring is present', () => {
    const rules = [
      {
        method: 'GET',
        path: '/search',
        origin: 'https://example.com',
        valid: [
          {
            queryParam: 'foo',
            values: ['bar'],
          },
        ],
      },
    ] as any;

    const filter = loadFilters(rules, 'default', {});

    expect(filter({ url: '/search', method: 'GET' } as any)).toBe(false);
    expect(filter({ url: '/search?foo=bar', method: 'GET' } as any)).not.toBe(
      false,
    );
  });

  it('handles querystrings with additional "?" characters (split only on first "?")', () => {
    const rules = [
      {
        method: 'GET',
        path: '/search',
        origin: 'https://example.com',
        valid: [
          {
            queryParam: 'q',
            values: ['a?b'],
          },
        ],
      },
    ] as any;

    const filter = loadFilters(rules, 'default', {});

    expect(filter({ url: '/search?q=a?b', method: 'GET' } as any)).not.toBe(
      false,
    );
  });

  it('does not throw on invalid regex rules and safely never matches them', () => {
    const rules = [
      {
        method: 'POST',
        path: '/payload',
        origin: 'https://example.com',
        valid: [
          {
            path: 'foo',
            regex: '[',
          },
        ],
      },
    ] as any;

    const filter = loadFilters(rules, 'default', {});

    expect(() => {
      const res = filter({
        url: '/payload',
        method: 'POST',
        body: jsonBuffer({ foo: 'bar' }),
        headers: {},
      } as any);
      expect(res).toBe(false);
    }).not.toThrow();
  });

  it('compiles identical body regex patterns only once via the regex cache', () => {
    const pattern = '^foo.*$';
    const OriginalRegExp = RegExp;
    let patternCompileCount = 0;

    jest.isolateModules(() => {
      jest.resetModules();

      jest.doMock('path-to-regexp', () => {
        return (p: string, keys: any[]) => {
          void p;
          void keys;
          return {
            exec: () => ['match'],
          };
        };
      });

      const {
        loadFilters,
      } = require('../../lib/hybrid-sdk/common/filter/filtersAsync');

      const regExpSpy = jest
        .spyOn(global as any, 'RegExp')
        .mockImplementation((...args: any[]) => {
          if (args[0] === pattern) {
            patternCompileCount += 1;
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          return new (OriginalRegExp as any)(...args);
        });

      const rules = [
        {
          method: 'POST',
          path: '/payload',
          origin: 'https://example.com',
          valid: [
            {
              path: 'foo',
              regex: pattern,
            },
          ],
        },
        {
          method: 'POST',
          path: '/payload',
          origin: 'https://example.com',
          valid: [
            {
              path: 'foo',
              regex: pattern,
            },
          ],
        },
      ] as any;

      const filter = loadFilters(rules, 'default', {});

      const res = filter({
        url: '/payload',
        method: 'POST',
        body: jsonBuffer({ foo: 'foobar' }),
        headers: {},
      } as any);

      expect(res).not.toBe(false);
      regExpSpy.mockRestore();
    });

    expect(patternCompileCount).toBe(1);
  });
});
