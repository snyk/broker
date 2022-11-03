import * as path from 'path';
import * as loadFilterRules from '../../lib/filter-rules-loading';

const scmRulesToTest = [
  'azure-repos',
  'bitbucket-server',
  'github-com',
  'github-enterprise',
  'gitlab',
];

describe('filter Rules Loading', () => {
  test.each(scmRulesToTest)(
    'Loads normal accept file - Testing %s',
    (folder) => {
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
    },
  );

  test.each(scmRulesToTest)(
    'Skip injection if no or invalid IAC extensions - Testing %s',
    (folder) => {
      process.env.ACCEPT_IAC = 'rf';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid IAC extensions - Testing %s',
    (folder) => {
      process.env.ACCEPT_IAC = 'tf,yaml, json,yml,tpl';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid IAC extensions - Testing %s',
    (folder) => {
      process.env.ACCEPT_IAC = 'tf,json';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid CODE rules - Testing %s',
    (folder) => {
      process.env.ACCEPT_CODE = 'true';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CODE;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid CODE rules and IAC extensions (yaml only) - Testing %s',
    (folder) => {
      process.env.ACCEPT_CODE = 'true';
      process.env.ACCEPT_IAC = 'yaml';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CODE;
      delete process.env.ACCEPT_IAC;
    },
  );
});
