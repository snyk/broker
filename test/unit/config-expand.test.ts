import {
  expand,
  expandConfigObjectRecursively,
  expandPlaceholderValuesInFlatList,
} from '../../lib/hybrid-sdk/common/config/config';

describe('expand', () => {
  describe('Basic Variable Expansion', () => {
    it('should expand a single variable reference', () => {
      const env = {
        BASE: 'https://api.com',
        URL: '$BASE/v1',
      };
      const result = expand(env);

      expect(result.BASE).toBe('https://api.com');
      expect(result.URL).toBe('https://api.com/v1');
    });

    it('should expand multiple variable references in one value', () => {
      const env = {
        HOST: 'api',
        DOMAIN: 'com',
        URL: '$HOST.example.$DOMAIN',
      };
      const result = expand(env);

      expect(result.URL).toBe('api.example.com');
    });

    it('should leave non-existent variables as literal strings', () => {
      const env = {
        URL: '$NONEXISTENT/path',
      };
      const result = expand(env);

      expect(result.URL).toBe('$NONEXISTENT/path');
    });
  });

  describe('Pool Expansion', () => {
    it('should create pool expansion from comma-separated string', () => {
      const env = {
        SERVER_POOL: 's1.com,s2.com',
        URL: '$SERVER/api',
      };
      const result = expand(env);

      expect(result.SERVER_POOL).toEqual(['s1.com', 's2.com']);
      expect(result.URL_POOL).toEqual(['s1.com/api', 's2.com/api']);
    });

    it('should handle pool with whitespace in comma-separated string', () => {
      const env = {
        SERVER_POOL: 's1.com, s2.com, s3.com',
        URL: '$SERVER/api',
      };
      const result = expand(env);

      expect(result.SERVER_POOL).toEqual(['s1.com', 's2.com', 's3.com']);
      expect(result.URL_POOL).toEqual([
        's1.com/api',
        's2.com/api',
        's3.com/api',
      ]);
    });

    it('should handle pool expansion with multiple variables', () => {
      const env = {
        SERVER_POOL: 's1,s2',
        PORT: '8080',
        URL: '$SERVER:$PORT',
      };
      const result = expand(env);

      expect(result.SERVER_POOL).toEqual(['s1', 's2']);
      expect(result.URL_POOL).toEqual(['s1:8080', 's2:8080']);
    });

    it('should handle pool expansion where pool variable is referenced multiple times', () => {
      const env = {
        SERVER_POOL: 's1.com,s2.com',
        URL: '$SERVER://$SERVER/api',
      };
      const result = expand(env);

      expect(result.SERVER_POOL).toEqual(['s1.com', 's2.com']);
      expect(result.URL_POOL).toEqual([
        's1.com://s1.com/api',
        's2.com://s2.com/api',
      ]);
    });

    it('should handle pool expansion with other variables in the value', () => {
      const env = {
        SERVER_POOL: 's1,s2',
        PROTOCOL: 'https',
        PORT: '8080',
        URL: '$PROTOCOL://$SERVER:$PORT',
      };
      const result = expand(env);

      expect(result.SERVER_POOL).toEqual(['s1', 's2']);
      expect(result.URL_POOL).toEqual(['https://s1:8080', 'https://s2:8080']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values', () => {
      const env = {
        EMPTY: '',
        URL: '$EMPTY/path',
      };
      const result = expand(env);

      expect(result.EMPTY).toBe('');
      // Empty string is falsy, so $EMPTY won't be replaced (obj[keyToReplace] || key returns key)
      expect(result.URL).toBe('$EMPTY/path');
    });

    it('should leave values with no variable references unchanged', () => {
      const env = {
        PLAIN: 'no variables here',
        NUMBER: '12345',
        SPECIAL: '!@#$%^&*()',
      };
      const result = expand(env);

      expect(result.PLAIN).toBe('no variables here');
      expect(result.NUMBER).toBe('12345');
      expect(result.SPECIAL).toBe('!@#$%^&*()');
    });

    it('should handle variables with special characters in their values', () => {
      const env = {
        TOKEN: 'abc$123',
        URL: '$TOKEN/test',
      };
      const result = expand(env);

      expect(result.URL).toBe('abc$123/test');
    });

    it('should handle escaped dollar signs', () => {
      const env = {
        VALUE: 'test',
        URL: '\\$VALUE/path',
      };
      const result = expand(env);

      // The regex matches \\?\$ so escaped dollar should remain
      expect(result.URL).toBe('\\$VALUE/path');
    });

    it('should handle circular references (variable references itself)', () => {
      const env = {
        CIRCULAR: '$CIRCULAR',
      };
      const result = expand(env);

      // Should remain as literal since it references itself
      expect(result.CIRCULAR).toBe('$CIRCULAR');
    });

    it('should handle variables referencing other variables that reference variables', () => {
      const env = {
        BASE: 'api',
        HOST: '$BASE',
        URL: '$HOST.com',
      };
      const result = expand(env);

      // Since variables are processed in order, BASE is expanded first
      // Then HOST should be expanded, then URL
      expect(result.BASE).toBe('api');
      expect(result.HOST).toBe('api');
      expect(result.URL).toBe('api.com');
    });

    it('should handle forward references (variable references a future variable)', () => {
      const env = {
        VAR1: '$VAR2',
        VAR2: 'value',
      };
      const result = expand(env);

      expect(result.VAR1).toBe('value');
      expect(result.VAR2).toBe('value');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple pool expansions in same object', () => {
      const env = {
        SERVER_POOL: 's1.com,s2.com',
        PORT_POOL: '8080,9090',
        SERVER_URL: '$SERVER/api',
        PORT_URL: '$PORT/health',
      };
      const result = expand(env);

      expect(result.SERVER_POOL).toEqual(['s1.com', 's2.com']);
      expect(result.PORT_POOL).toEqual(['8080', '9090']);
      expect(result.SERVER_URL_POOL).toEqual(['s1.com/api', 's2.com/api']);
      expect(result.PORT_URL_POOL).toEqual(['8080/health', '9090/health']);
    });

    it('should handle mix of regular expansion and pool expansion', () => {
      const env = {
        BASE: 'https://api',
        SERVER_POOL: 's1.com,s2.com',
        DOMAIN: 'com',
        BASE_URL: '$BASE.$DOMAIN',
        SERVER_URL: '$SERVER/api',
      };
      const result = expand(env);

      expect(result.BASE).toBe('https://api');
      expect(result.DOMAIN).toBe('com');
      expect(result.BASE_URL).toBe('https://api.com');
      expect(result.SERVER_POOL).toEqual(['s1.com', 's2.com']);
      expect(result.SERVER_URL_POOL).toEqual(['s1.com/api', 's2.com/api']);
    });

    it('should process variables in Object.keys() order', () => {
      const env = {
        Z_VAR: 'z-value',
        A_VAR: '$Z_VAR/a-value',
        M_VAR: '$A_VAR/m-value',
      };
      const result = expand(env);

      // Variables processed in insertion order: Z_VAR, A_VAR, M_VAR
      // So Z_VAR is processed first, then A_VAR can use it, then M_VAR can use A_VAR
      expect(result.Z_VAR).toBe('z-value');
      expect(result.A_VAR).toBe('z-value/a-value'); // Z_VAR was expanded
      expect(result.M_VAR).toBe('z-value/a-value/m-value'); // A_VAR was expanded
    });

    it('should handle variables with underscores and numbers', () => {
      const env = {
        VAR_1: 'value1',
        VAR_2: 'value2',
        VAR_3_4: 'value34',
        URL: '$VAR_1/$VAR_2/$VAR_3_4',
      };
      const result = expand(env);

      expect(result.URL).toBe('value1/value2/value34');
    });
  });
});

describe('expandPlaceholderValuesInFlatList', () => {
  describe('Basic Variable Expansion', () => {
    it('should expand a single variable reference', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {
        url: '$BASE/v1',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      expect(result.url).toBe('https://api.com/v1');
    });

    it('should expand multiple variable references in one value', () => {
      const referenceConfig = {
        HOST: 'api',
        DOMAIN: 'com',
      };
      const objectToExpand = {
        url: '$HOST.example.$DOMAIN',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Note: Current implementation has a limitation - it replaces on original value each iteration
      // So only the last match gets replaced correctly. This test documents the actual behavior.
      expect(result.url).toBe('$HOST.example.com');
    });

    it('should replace non-existent variables with undefined', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {
        url: '$NONEXISTENT/path',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Non-existent variables are replaced with undefined, which becomes 'undefined' in string context
      expect(result.url).toBe('undefined/path');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values', () => {
      const referenceConfig = {
        EMPTY: '',
      };
      const objectToExpand = {
        url: '$EMPTY/path',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Empty string is replaced, resulting in '/path'
      expect(result.url).toBe('/path');
    });

    it('should leave values with no variable references unchanged', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {
        plain: 'no variables here',
        number: '12345',
        special: '!@#$%^&*()',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      expect(result.plain).toBe('no variables here');
      expect(result.number).toBe('12345');
      expect(result.special).toBe('!@#$%^&*()');
    });

    it('should leave non-string values unchanged', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {
        number: 12345,
        boolean: true,
        array: [1, 2, 3],
        nullValue: null,
        object: { nested: 'value' },
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      expect(result.number).toBe(12345);
      expect(result.boolean).toBe(true);
      expect(result.array).toEqual([1, 2, 3]);
      expect(result.nullValue).toBeNull();
      expect(result.object).toEqual({ nested: 'value' });
    });

    it('should handle variables with special characters in their values', () => {
      const referenceConfig = {
        TOKEN: 'abc$123',
      };
      const objectToExpand = {
        url: '$TOKEN/test',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      expect(result.url).toBe('abc$123/test');
    });

    it('should handle variables with underscores and numbers', () => {
      const referenceConfig = {
        VAR_1: 'value1',
        VAR_2: 'value2',
        VAR_3_4: 'value34',
      };
      const objectToExpand = {
        url: '$VAR_1/$VAR_2/$VAR_3_4',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Note: Due to implementation limitation, only the last match gets replaced correctly
      // This test documents the actual behavior
      expect(result.url).toBe('$VAR_1/$VAR_2/value34');
    });

    it('should handle multiple placeholders in same value', () => {
      const referenceConfig = {
        PROTOCOL: 'https',
        HOST: 'api',
        DOMAIN: 'com',
        PORT: '8080',
      };
      const objectToExpand = {
        url: '$PROTOCOL://$HOST.$DOMAIN:$PORT',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Note: Current implementation replaces on original value each iteration
      // Only the last match (PORT) gets replaced correctly in the final result
      // This test documents the actual behavior
      expect(result.url).toBe('$PROTOCOL://$HOST.$DOMAIN:8080');
    });
  });

  describe('Flat Object Limitation', () => {
    it('should not process nested objects', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {
        url: '$BASE/v1',
        nested: {
          endpoint: '$BASE/v2',
        },
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Top-level string should be expanded
      expect(result.url).toBe('https://api.com/v1');
      // Nested object should remain unchanged (not processed)
      expect(result.nested).toEqual({ endpoint: '$BASE/v2' });
    });

    it('should not process deeply nested objects', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
        PORT: '8080',
      };
      const objectToExpand = {
        url: '$BASE/v1',
        level1: {
          level2: {
            level3: {
              endpoint: '$BASE:$PORT',
            },
          },
        },
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Top-level string should be expanded
      expect(result.url).toBe('https://api.com/v1');
      // Nested structure should remain unchanged
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.level1 as any).level2.level3.endpoint).toBe('$BASE:$PORT');
    });

    it('should not process arrays containing strings with variables', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {
        url: '$BASE/v1',
        endpoints: ['$BASE/v2', '$BASE/v3'],
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Top-level string should be expanded
      expect(result.url).toBe('https://api.com/v1');
      // Array should remain unchanged (not processed)
      expect(result.endpoints).toEqual(['$BASE/v2', '$BASE/v3']);
    });
  });

  describe('String Filtering', () => {
    it('should only process strings containing $ character', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {
        withDollar: '$BASE/v1',
        withoutDollar: 'plain string',
        emptyString: '',
        numberString: '12345',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // String with $ should be processed
      expect(result.withDollar).toBe('https://api.com/v1');
      // Strings without $ should be left unchanged
      expect(result.withoutDollar).toBe('plain string');
      expect(result.emptyString).toBe('');
      expect(result.numberString).toBe('12345');
    });

    it('should not process strings that contain $ but are not valid placeholders', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {
        // These contain $ but don't match the placeholder pattern
        invalid1: '$',
        invalid2: '$$',
        invalid3: '$ ',
        // text$text contains $text which matches the pattern, so it gets processed
        invalid4: 'text$text',
        // This one should be processed
        valid: '$BASE/v1',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Invalid patterns should remain unchanged (regex won't match them)
      expect(result.invalid1).toBe('$');
      expect(result.invalid2).toBe('$$');
      expect(result.invalid3).toBe('$ ');
      // text$text contains $text which matches, so it gets replaced with undefined
      expect(result.invalid4).toBe('textundefined');
      // Valid placeholder should be expanded
      expect(result.valid).toBe('https://api.com/v1');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple keys with different variable references', () => {
      const referenceConfig = {
        API_HOST: 'api.example.com',
        DB_HOST: 'db.example.com',
        CACHE_HOST: 'cache.example.com',
      };
      const objectToExpand = {
        apiUrl: '$API_HOST',
        dbUrl: '$DB_HOST',
        cacheUrl: '$CACHE_HOST',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      expect(result.apiUrl).toBe('api.example.com');
      expect(result.dbUrl).toBe('db.example.com');
      expect(result.cacheUrl).toBe('cache.example.com');
    });

    it('should handle object with mix of string and non-string values', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
        PORT: '8080',
      };
      const objectToExpand = {
        url: '$BASE:$PORT',
        number: 42,
        boolean: true,
        nullValue: null,
        plainString: 'no variables',
        nested: { key: 'value' },
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Note: Only the last match ($PORT) gets replaced due to implementation limitation
      expect(result.url).toBe('$BASE:8080');
      expect(result.number).toBe(42);
      expect(result.boolean).toBe(true);
      expect(result.nullValue).toBeNull();
      expect(result.plainString).toBe('no variables');
      expect(result.nested).toEqual({ key: 'value' });
    });

    it('should handle empty reference config', () => {
      const referenceConfig = {};
      const objectToExpand = {
        url: '$BASE/v1',
      };
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      // Non-existent variables are replaced with undefined
      expect(result.url).toBe('undefined/v1');
    });

    it('should handle empty object to expand', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objectToExpand = {};
      const result = expandPlaceholderValuesInFlatList(
        objectToExpand,
        referenceConfig,
      );

      expect(result).toEqual({});
    });
  });
});

describe('expandConfigObjectRecursively', () => {
  describe('Basic Recursive Variable Expansion', () => {
    it('should expand a single variable reference in nested object', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objToExpand = {
        url: '$BASE/v1',
        nested: {
          endpoint: '$BASE/v2',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.url).toBe('https://api.com/v1');
      expect(result.nested.endpoint).toBe('https://api.com/v2');
    });

    it('should expand multiple variable references in nested values', () => {
      const referenceConfig = {
        HOST: 'api',
        DOMAIN: 'com',
      };
      const objToExpand = {
        url: '$HOST.example.$DOMAIN',
        nested: {
          apiUrl: '$HOST.$DOMAIN',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.url).toBe('api.example.com');
      expect(result.nested.apiUrl).toBe('api.com');
    });

    it('should expand variables at different nesting levels', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
        PORT: '8080',
      };
      const objToExpand = {
        level1: {
          level2: {
            level3: {
              url: '$BASE:$PORT',
            },
            port: '$PORT',
          },
          base: '$BASE',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.level1.base).toBe('https://api.com');
      expect(result.level1.level2.port).toBe('8080');
      expect(result.level1.level2.level3.url).toBe('https://api.com:8080');
    });

    it('should expand variables referencing other variables across nesting levels', () => {
      // referenceConfig should have already expanded values, not variables
      const referenceConfig = {
        BASE: 'api',
        HOST: 'api', // Already expanded, not '$BASE'
        DOMAIN: 'com',
      };
      const objToExpand = {
        top: {
          middle: {
            bottom: {
              url: '$HOST.$DOMAIN',
            },
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      // HOST should be used from referenceConfig
      expect(result.top.middle.bottom.url).toBe('api.com');
    });
  });

  describe('Pool Expansion in Nested Contexts', () => {
    it('should create pool expansion in nested objects', () => {
      const referenceConfig = {
        SERVER_POOL: 's1.com,s2.com',
      };
      const objToExpand = {
        nested: {
          url: '$SERVER/api',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      // When pool expansion happens, the value is replaced with the array
      // Note: The current implementation doesn't create _POOL keys like expand() does
      expect(result.nested.url).toEqual(['s1.com/api', 's2.com/api']);
    });

    it('should handle pool expansion with multiple variables in nested structure', () => {
      const referenceConfig = {
        SERVER_POOL: 's1,s2',
        PORT: '8080',
      };
      const objToExpand = {
        level1: {
          level2: {
            url: '$SERVER:$PORT',
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.level1.level2.url).toEqual(['s1:8080', 's2:8080']);
    });

    it('should handle pool expansion where pool variable is referenced multiple times in nested paths', () => {
      const referenceConfig = {
        SERVER_POOL: 's1.com,s2.com',
      };
      const objToExpand = {
        nested: {
          url: '$SERVER://$SERVER/api',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.nested.url).toEqual([
        's1.com://s1.com/api',
        's2.com://s2.com/api',
      ]);
    });

    it('should handle multiple pool expansions at different nesting levels', () => {
      const referenceConfig = {
        SERVER_POOL: 's1.com,s2.com',
        PORT_POOL: '8080,9090',
      };
      const objToExpand = {
        top: {
          serverUrl: '$SERVER/api',
          nested: {
            portUrl: '$PORT/health',
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.top.serverUrl).toEqual(['s1.com/api', 's2.com/api']);
      expect(result.top.nested.portUrl).toEqual(['8080/health', '9090/health']);
    });

    it('should handle pool expansion with other variables in nested structure', () => {
      const referenceConfig = {
        SERVER_POOL: 's1,s2',
        PROTOCOL: 'https',
        PORT: '8080',
      };
      const objToExpand = {
        config: {
          url: '$PROTOCOL://$SERVER:$PORT',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.config.url).toEqual(['https://s1:8080', 'https://s2:8080']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty nested objects', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objToExpand = {
        empty: {},
        nested: {
          alsoEmpty: {},
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.empty).toEqual({});
      expect(result.nested.alsoEmpty).toEqual({});
    });

    it('should leave non-string values unchanged', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objToExpand = {
        number: 12345,
        boolean: true,
        array: [1, 2, 3],
        nested: {
          number: 67890,
          boolean: false,
          array: ['a', 'b', 'c'],
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.number).toBe(12345);
      expect(result.boolean).toBe(true);
      expect(result.array).toEqual([1, 2, 3]);
      expect(result.nested.number).toBe(67890);
      expect(result.nested.boolean).toBe(false);
      expect(result.nested.array).toEqual(['a', 'b', 'c']);
    });

    it('should handle array as root objToExpand', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
        PORT: '8080',
      };
      const objToExpand = ['$BASE/v1', '$BASE:$PORT/v2', 'plain-string'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      // The function should recurse into arrays and expand string values
      expect(result).toEqual([
        'https://api.com/v1',
        'https://api.com:8080/v2',
        'plain-string',
      ]);
    });

    it('should handle circular references in nested structures', () => {
      const referenceConfig = {
        CIRCULAR: '$CIRCULAR',
      };
      const objToExpand = {
        nested: {
          circular: '$CIRCULAR',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      // Should remain as literal since it references itself
      expect(result.nested.circular).toBe('$CIRCULAR');
    });

    it('should handle variables referencing other variables that reference variables in nested objects', () => {
      // referenceConfig should have already expanded values
      const referenceConfig = {
        BASE: 'api',
        HOST: 'api', // Already expanded, not '$BASE'
        DOMAIN: 'com',
      };
      const objToExpand = {
        nested: {
          url: '$HOST.$DOMAIN',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      // HOST should be used from referenceConfig
      expect(result.nested.url).toBe('api.com');
    });

    it('should leave non-existent variables as literal strings in nested contexts', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objToExpand = {
        nested: {
          url: '$NONEXISTENT/path',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.nested.url).toBe('$NONEXISTENT/path');
    });

    it('should handle empty string values in nested objects', () => {
      const referenceConfig = {
        EMPTY: '',
      };
      const objToExpand = {
        nested: {
          url: '$EMPTY/path',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      // Empty string is falsy, so $EMPTY won't be replaced
      expect(result.nested.url).toBe('$EMPTY/path');
    });

    it('should leave values with no variable references unchanged in nested objects', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
      };
      const objToExpand = {
        nested: {
          plain: 'no variables here',
          number: '12345',
          special: '!@#$%^&*()',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.nested.plain).toBe('no variables here');
      expect(result.nested.number).toBe('12345');
      expect(result.nested.special).toBe('!@#$%^&*()');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle deep nesting (3+ levels)', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
        PORT: '8080',
        PATH: '/v1',
      };
      const objToExpand = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  url: '$BASE:$PORT$PATH',
                },
              },
            },
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.level1.level2.level3.level4.level5.url).toBe(
        'https://api.com:8080/v1',
      );
    });

    it('should handle mix of regular expansion and pool expansion in nested structures', () => {
      const referenceConfig = {
        BASE: 'https://api',
        SERVER_POOL: 's1.com,s2.com',
        DOMAIN: 'com',
      };
      const objToExpand = {
        top: {
          baseUrl: '$BASE.$DOMAIN',
          nested: {
            serverUrl: '$SERVER/api',
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.top.baseUrl).toBe('https://api.com');
      expect(result.top.nested.serverUrl).toEqual(['s1.com/api', 's2.com/api']);
    });

    it('should handle multiple nested objects with different variable references', () => {
      const referenceConfig = {
        API_HOST: 'api.example.com',
        DB_HOST: 'db.example.com',
        CACHE_HOST: 'cache.example.com',
      };
      const objToExpand = {
        api: {
          url: '$API_HOST',
        },
        database: {
          url: '$DB_HOST',
        },
        cache: {
          url: '$CACHE_HOST',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.api.url).toBe('api.example.com');
      expect(result.database.url).toBe('db.example.com');
      expect(result.cache.url).toBe('cache.example.com');
    });

    it('should handle nested objects with arrays containing strings with variables', () => {
      const referenceConfig = {
        BASE: 'https://api.com',
        PORT: '8080',
      };
      const objToExpand = {
        nested: {
          endpoints: ['$BASE/v1', '$BASE:$PORT/v2'],
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      // The function recurses into arrays and expands string values within them
      expect(result.nested.endpoints).toEqual([
        'https://api.com/v1',
        'https://api.com:8080/v2',
      ]);
    });

    it('should handle variables with underscores and numbers in nested contexts', () => {
      const referenceConfig = {
        VAR_1: 'value1',
        VAR_2: 'value2',
        VAR_3_4: 'value34',
      };
      const objToExpand = {
        nested: {
          url: '$VAR_1/$VAR_2/$VAR_3_4',
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.nested.url).toBe('value1/value2/value34');
    });

    it('should handle complex nested structure with multiple pool expansions', () => {
      const referenceConfig = {
        SERVER_POOL: 's1.com,s2.com',
        PORT: '8080', // Regular variable, not a pool
        PROTOCOL: 'https',
      };
      const objToExpand = {
        config: {
          servers: {
            server1: {
              url: '$PROTOCOL://$SERVER:$PORT',
            },
            server2: {
              url: '$PROTOCOL://$SERVER:$PORT',
            },
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      // Each nested object with pool expansion replaces the value with an array
      // Note: When multiple pools exist, only the first one found is expanded
      expect(result.config.servers.server1.url).toEqual([
        'https://s1.com:8080',
        'https://s2.com:8080',
      ]);
      expect(result.config.servers.server2.url).toEqual([
        'https://s1.com:8080',
        'https://s2.com:8080',
      ]);
    });

    it('should handle nested structure with variables at multiple levels', () => {
      // referenceConfig should have already expanded values
      const referenceConfig = {
        BASE: 'api',
        HOST: 'api', // Already expanded, not '$BASE'
        DOMAIN: 'com',
        PORT: '8080',
      };
      const objToExpand = {
        level1: {
          url1: '$HOST.$DOMAIN',
          level2: {
            url2: '$BASE:$PORT',
            level3: {
              url3: '$HOST.$DOMAIN:$PORT',
            },
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = expandConfigObjectRecursively(
        objToExpand,
        referenceConfig,
      ) as any;

      expect(result.level1.url1).toBe('api.com');
      expect(result.level1.level2.url2).toBe('api:8080');
      expect(result.level1.level2.level3.url3).toBe('api.com:8080');
    });
  });
});
