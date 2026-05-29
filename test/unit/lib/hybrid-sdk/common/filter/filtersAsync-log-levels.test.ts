import { loadFilters } from '../../../../../../lib/hybrid-sdk/common/filter/filtersAsync';
import { Rule } from '../../../../../../lib/hybrid-sdk/common/types/filter';
import { log as logger } from '../../../../../../lib/logs/logger';

describe('filtersAsync log levels — regex rule failure', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs at WARN (not ERROR) when a body regex rule fails to compile/test', () => {
    const rules: Rule[] = [
      {
        method: 'POST',
        path: '/anything',
        valid: [
          {
            path: 'name',
            // Invalid regex — unclosed character class triggers throw in
            // `new RegExp(regex)` inside the bodyRegexFilters branch.
            regex: '[unterminated',
          },
        ],
        // origin not needed for filter logic; cast to satisfy Rule typing.
      } as unknown as Rule,
    ];

    const filter = loadFilters(rules, 'default', {});

    const filterResponse = filter({
      url: '/anything',
      method: 'POST',
      body: JSON.stringify({ name: 'whatever' }),
      requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    } as any);

    // Rule does not match (the only validator threw → returned false).
    expect(filterResponse).toBe(false);

    // New level: WARN with the diagnostic payload.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'name',
        regex: '[unterminated',
      }),
      'failed to test regex rule',
    );
    // Old level absent.
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'failed to test regex rule',
    );
  });
});
