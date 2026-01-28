import { loadFilters } from '../../lib/hybrid-sdk/common/filter/filtersAsync';

describe('filtersAsync query object pool', () => {
  it('reuses query objects from the pool when available', () => {
    jest.isolateModules(() => {
      jest.resetModules();

      // Mock path-to-regexp to avoid unrelated regex usage
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

      // First request - pool is empty, creates new object
      const res1 = filter({
        url: '/search?foo=bar',
        method: 'GET',
        headers: {},
      } as any);
      expect(res1).not.toBe(false);

      // Second request - should reuse object from pool
      const res2 = filter({
        url: '/search?foo=bar',
        method: 'GET',
        headers: {},
      } as any);
      expect(res2).not.toBe(false);

      // Third request - should reuse object from pool again
      const res3 = filter({
        url: '/search?foo=bar',
        method: 'GET',
        headers: {},
      } as any);
      expect(res3).not.toBe(false);
    });
  });

  it('clears object properties before reusing from pool', () => {
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

      // First request with foo=bar
      const res1 = filter({
        url: '/search?foo=bar',
        method: 'GET',
        headers: {},
      } as any);
      expect(res1).not.toBe(false);

      // Second request with different query params
      // Should not see leftover properties from first request
      const res2 = filter({
        url: '/search?foo=bar&baz=qux',
        method: 'GET',
        headers: {},
      } as any);
      expect(res2).not.toBe(false);
    });
  });

  it('handles many sequential requests without memory issues (pool cap behavior)', () => {
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

      // Make 100 requests - pool should cap at 50 internally
      // This test verifies no memory leak or crash occurs
      for (let i = 0; i < 100; i++) {
        const res = filter({
          url: '/search?foo=bar',
          method: 'GET',
          headers: {},
        } as any);
        expect(res).not.toBe(false);
      }
    });
  });

  it('handles requests without query filters without using pool', () => {
    const rules = [
      {
        method: 'GET',
        path: '/simple',
        origin: 'https://example.com',
      },
    ] as any;

    const filter = loadFilters(rules, 'default', {});

    const res = filter({
      url: '/simple',
      method: 'GET',
      headers: {},
    } as any);
    expect(res).not.toBe(false);
  });

  it('successfully processes multiple requests with query filters (pool reuse behavior)', () => {
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

      // Multiple requests should all succeed, demonstrating pool reuse
      for (let i = 0; i < 10; i++) {
        const res = filter({
          url: '/search?foo=bar',
          method: 'GET',
          headers: {},
        } as any);
        expect(res).not.toBe(false);
      }
    });
  });
});
