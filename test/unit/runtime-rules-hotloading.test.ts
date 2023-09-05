import path from 'path';
import loadFilterRules from '../../lib/common/filter/filter-rules-loading';

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
      process.env.ACCEPT = 'accept.json';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Skip injection if no or invalid IAC extensions - Testing %s',
    (folder) => {
      process.env.ACCEPT_IAC = 'rf';
      process.env.ACCEPT = 'accept.json';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid IAC extensions - Testing %s',
    (folder) => {
      process.env.ACCEPT_IAC = 'tf,yaml, json,yml,tpl';
      process.env.ACCEPT = 'accept.json';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid IAC extensions - Testing %s',
    (folder) => {
      process.env.ACCEPT_IAC = 'tf,json';
      process.env.ACCEPT = 'accept.json';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid CODE rules - Testing %s',
    (folder) => {
      process.env.ACCEPT_CODE = 'true';
      process.env.ACCEPT = 'accept.json';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CODE;
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid Git rules - Testing %s',
    (folder) => {
      process.env.ACCEPT_GIT = 'true';
      process.env.ACCEPT = 'accept.json';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_GIT;
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid CODE GH rules - Testing %s',
    (folder) => {
      process.env.ACCEPT_LARGE_MANIFESTS = 'true';
      process.env.ACCEPT = 'accept.json';

      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_LARGE_MANIFESTS;
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid CODE rules and IAC extensions (yaml only) - Testing %s',
    (folder) => {
      process.env.ACCEPT_CODE = 'true';
      process.env.ACCEPT_IAC = 'yaml';
      process.env.ACCEPT = 'accept.json';
      const loadedRules = loadFilterRules(
        'accept.json.sample',
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CODE;
      delete process.env.ACCEPT_IAC;
      delete process.env.ACCEPT;
    },
  );
});
