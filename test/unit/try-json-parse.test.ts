import tryJSONParse from '../../lib/try-json-parse';

describe('tryJSONParse', () => {
  it('parses JSON', () => {
    const data = {
      number: '123',
      animals: ['dog', 'cat'],
      complex: { nested: 'data' },
    };

    const dataAsJson = JSON.stringify(data);
    const dataAsBuffer = Buffer.from(dataAsJson);
    const dataAsUint8Array = Uint8Array.from(dataAsBuffer); // primus with EJSON returns data as Uint8Arrays

    expect(tryJSONParse(dataAsJson)).toEqual(data);
    expect(tryJSONParse(dataAsBuffer)).toEqual(data);
    expect(tryJSONParse(dataAsUint8Array)).toEqual(data);
    expect(tryJSONParse(undefined)).toEqual({});
    expect(tryJSONParse(null)).toEqual({});
    expect(tryJSONParse(data)).toEqual({});
    expect(tryJSONParse('nonsense')).toEqual({});
    expect(tryJSONParse('null')).toEqual({});
  });
});
