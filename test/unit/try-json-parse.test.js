const test = require('tap').test;

const tryJSONParse = require('../../lib/try-json-parse');

test('tryJSONParse', (t) => {
  const data = {
    number: '123',
    animals: ['dog', 'cat'],
    complex: { nested: 'data' },
  };

  const dataAsJson = JSON.stringify(data);
  const dataAsBuffer = Buffer.from(dataAsJson);
  const dataAsUint8Array = Uint8Array.from(dataAsBuffer); // primus with EJSON returns data as Uint8Arrays

  t.same(tryJSONParse(dataAsJson), data, 'Strings parse');
  t.same(tryJSONParse(dataAsBuffer), data, 'Buffers parse');
  t.same(tryJSONParse(dataAsUint8Array), data, 'Uint8Arrays parse');
  t.same(tryJSONParse(undefined), {}, 'undefined parses as empty');
  t.same(tryJSONParse(null), {}, 'null parses as empty');
  t.same(tryJSONParse(data), {}, 'objects parse as empty');
  t.same(tryJSONParse('nonsense'), {}, 'malformed strings parse as empty');
  t.same(tryJSONParse('null'), {}, 'null strings parse as empty');

  t.end();
});
