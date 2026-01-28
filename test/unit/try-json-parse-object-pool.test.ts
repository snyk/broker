import tryJSONParse, {
  getJsonObjectFromPool,
  returnJsonObjectToPool,
} from '../../lib/hybrid-sdk/common/utils/try-json-parse';

describe('tryJSONParse object pool', () => {
  it('getJsonObjectFromPool returns empty object when pool is empty', () => {
    // Clear pool by getting all objects
    const objects: any[] = [];
    for (let i = 0; i < 100; i++) {
      const obj = getJsonObjectFromPool();
      if (Object.keys(obj).length === 0) {
        objects.push(obj);
      } else {
        break;
      }
    }

    // Now pool should be empty
    const obj = getJsonObjectFromPool();
    expect(obj).toEqual({});
    expect(Object.keys(obj).length).toBe(0);
  });

  it('returnJsonObjectToPool adds object to pool for reuse', () => {
    const obj1 = { foo: 'bar', baz: 123 };
    returnJsonObjectToPool(obj1);

    const obj2 = getJsonObjectFromPool();
    expect(obj2).toBe(obj1); // Same reference
  });

  it('getJsonObjectFromPool clears properties before returning pooled object', () => {
    const obj1 = { foo: 'bar', baz: 123, nested: { deep: 'value' } };
    returnJsonObjectToPool(obj1);

    const obj2 = getJsonObjectFromPool();
    expect(obj2).toBe(obj1); // Same reference
    expect(Object.keys(obj2).length).toBe(0); // But cleared
    expect(obj2.foo).toBeUndefined();
    expect(obj2.baz).toBeUndefined();
    expect(obj2.nested).toBeUndefined();
  });

  it('returnJsonObjectToPool caps pool size at 50 objects', () => {
    // Clear pool first
    for (let i = 0; i < 100; i++) {
      getJsonObjectFromPool();
    }

    // Add 60 objects to pool
    for (let i = 0; i < 60; i++) {
      const obj = { index: i };
      returnJsonObjectToPool(obj);
    }

    // Try to retrieve 60 objects - should only get 50 (pool cap)
    const retrieved: any[] = [];
    let emptyCount = 0;
    for (let i = 0; i < 60; i++) {
      const obj = getJsonObjectFromPool();
      retrieved.push(obj);
      if (Object.keys(obj).length === 0) {
        emptyCount++;
      }
    }

    // First 50 should be from pool (cleared objects)
    // Last 10 should be new empty objects
    expect(retrieved.length).toBe(60);
    // At least 10 should be newly created (not from pool)
    expect(emptyCount).toBeGreaterThanOrEqual(10);
  });

  it('tryJSONParse avoids Buffer.from() when data is already a string', () => {
    const data = { test: 'value' };
    const jsonString = JSON.stringify(data);

    const result = tryJSONParse(jsonString);
    expect(result).toEqual(data);
  });

  it('tryJSONParse handles Buffer input efficiently', () => {
    const data = { test: 'value', number: 123 };
    const buffer = Buffer.from(JSON.stringify(data));

    const result = tryJSONParse(buffer);
    expect(result).toEqual(data);
  });

  it('tryJSONParse returns empty object for non-object JSON values', () => {
    expect(tryJSONParse('"string"')).toEqual({});
    expect(tryJSONParse('123')).toEqual({});
    expect(tryJSONParse('true')).toEqual({});
    expect(tryJSONParse('false')).toEqual({});
    expect(tryJSONParse('null')).toEqual({});
  });

  it('tryJSONParse returns arrays as-is since arrays are objects', () => {
    const arrayJson = JSON.stringify([1, 2, 3]);
    const result = tryJSONParse(arrayJson);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([1, 2, 3]);
  });

  it('tryJSONParse returns the parsed object directly when valid', () => {
    const data = { foo: 'bar', nested: { deep: 'value' } };
    const jsonString = JSON.stringify(data);

    const result = tryJSONParse(jsonString);
    expect(result).toEqual(data);
    expect(result).not.toBe(data); // Different instance
  });

  it('tryJSONParse handles Uint8Array input', () => {
    const data = { test: 'value' };
    const buffer = Buffer.from(JSON.stringify(data));
    const uint8Array = Uint8Array.from(buffer);

    const result = tryJSONParse(uint8Array);
    expect(result).toEqual(data);
  });

  it('tryJSONParse returns empty object for invalid JSON', () => {
    expect(tryJSONParse('not valid json')).toEqual({});
    expect(tryJSONParse('{"incomplete":')).toEqual({});
    expect(tryJSONParse('{broken}')).toEqual({});
  });

  it('tryJSONParse returns empty object for empty/null/undefined input', () => {
    expect(tryJSONParse('')).toEqual({});
    expect(tryJSONParse(null)).toEqual({});
    expect(tryJSONParse(undefined)).toEqual({});
  });

  it('pool functions work correctly in sequence', () => {
    // Clear pool
    for (let i = 0; i < 100; i++) {
      getJsonObjectFromPool();
    }

    // Add and retrieve multiple times
    const obj1 = { a: 1 };
    returnJsonObjectToPool(obj1);
    const retrieved1 = getJsonObjectFromPool();
    expect(retrieved1).toBe(obj1);
    expect(Object.keys(retrieved1).length).toBe(0);

    // Add different object
    const obj2 = { b: 2 };
    returnJsonObjectToPool(obj2);
    const retrieved2 = getJsonObjectFromPool();
    expect(retrieved2).toBe(obj2);
    expect(Object.keys(retrieved2).length).toBe(0);

    // Return both and retrieve
    returnJsonObjectToPool(obj1);
    returnJsonObjectToPool(obj2);

    const r1 = getJsonObjectFromPool();
    const r2 = getJsonObjectFromPool();

    expect([r1, r2]).toContain(obj1);
    expect([r1, r2]).toContain(obj2);
  });
});
