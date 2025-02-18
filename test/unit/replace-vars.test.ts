import { getConfig, setConfig } from '../../lib/common/config/config';
import {
  replace,
  replaceUrlPartialChunk,
} from '../../lib/common/utils/replace-vars';
let config = getConfig();
const setConfigAndReturnOriginalConfigForTestOnly = (configObject) => {
  const originalConfig = Object.assign({}, config);
  setConfig(configObject);
  return originalConfig;
};

describe('replacePartialChunk', () => {
  const config = {
    RES_BODY_URL_SUB: 'http://replac.ed',
    BROKER_SERVER_URL: 'broker.com',
    BROKER_TOKEN: 'a-tok-en',
  };

  it('Replaces string completely in chunk', () => {
    const chunk =
      'Replace the "http://replac.ed/get/some/artifact" url please.';
    const prevPartial = null;
    const expectedChunk =
      'Replace the "http://internal-broker-server/broker/a-tok-en/get/some/artifact" url please.';

    expect(replaceUrlPartialChunk(chunk, prevPartial, config)).toEqual({
      newChunk: expectedChunk,
      partial: undefined,
    });
  });

  it('Removes replace string that is partially at end of chunk', () => {
    const chunk = 'Replace the "http://repla';
    const prevPartial = null;
    const expectedChunk = 'Replace the "';

    expect(replaceUrlPartialChunk(chunk, prevPartial, config)).toEqual({
      newChunk: expectedChunk,
      partial: 'http://repla',
    });
  });

  it('Replaces partial at start of chunk if matched with prevPartial', () => {
    const chunk = 'c.ed/get/some/artifact" url please.';
    const prevPartial = 'http://repla';
    const expectedChunk =
      'http://internal-broker-server/broker/a-tok-en/get/some/artifact" url please.';

    expect(replaceUrlPartialChunk(chunk, prevPartial, config)).toEqual({
      newChunk: expectedChunk,
      partial: undefined,
    });
  });

  it('Does not replace partial at start of chunk if not matched with prevPartial', () => {
    const chunk = 'ac.ed/get/some/artifact" url please.';
    const prevPartial = 'http://repla';
    const expectedChunk = 'http://replaac.ed/get/some/artifact" url please.';

    expect(replaceUrlPartialChunk(chunk, prevPartial, config)).toEqual({
      newChunk: expectedChunk,
      partial: undefined,
    });
  });
});

describe('replace - with arrays', () => {
  const config = {
    RES_BODY_URL_SUB: 'http://replac.ed',
    BROKER_SERVER_URL: 'broker.com',
    BROKER_TOKEN: 'a-tok-en',
    BITBUCKET_PASSWORD_POOL: ['1', '2', '3'],
    GITHUB_TOKEN_POOL: ['1'],
    githubTokenPool: ['1'],
  };

  it('Uses an array if configured - upper case', () => {
    const chunk = 'START ${GITHUB_TOKEN} END';
    const expected = 'START 1 END';

    expect(replace(chunk, config)).toEqual(expected);
  });

  it('Uses an array if configured - camel case', () => {
    const chunk = 'START ${githubToken} END';
    const expected = 'START 1 END';

    expect(replace(chunk, config)).toEqual(expected);
  });

  it('Goes back to the start of the array if end reached', () => {
    const chunk = 'START ${BITBUCKET_PASSWORD} END';
    const originalConfig = setConfigAndReturnOriginalConfigForTestOnly(config);
    expect(replace(chunk, config)).toEqual('START 1 END');

    expect(replace(chunk, config)).toEqual('START 2 END');

    expect(replace(chunk, config)).toEqual('START 3 END');

    expect(replace(chunk, config)).toEqual('START 1 END');
    setConfigAndReturnOriginalConfigForTestOnly(originalConfig);
  });
});
