import path from 'path';
import loadFilterRules from '../../lib/common/filter/filter-rules-loading';
import { CONFIGURATION } from '../../lib/common/config/config';
import camelcase from 'camelcase';

const scmRulesToTest = [
  'azure-repos',
  'bitbucket-server',
  'bitbucket-server-bearer-auth',
  'github',
  'github-enterprise',
  'gitlab',
];

describe('filter Rules Loading', () => {
  test.each(scmRulesToTest)(
    'Loads normal accept file - Testing %s',
    (folder) => {
      process.env.ACCEPT = 'accept.json';
      const loadedRules = loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPath: {},
        },
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
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPath: {},
        },
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
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPath: {},
        },
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
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPath: {},
        },
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
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPath: {},
        },
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
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPath: {},
        },
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
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPath: {},
        },
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
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPath: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CODE;
      delete process.env.ACCEPT_IAC;
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid AppRisk rules - Testing %s',
    (folder) => {
      process.env.ACCEPT_APPRISK = 'true';
      process.env.ACCEPT = 'accept.json';
      process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`] = 'true';
      const config: CONFIGURATION = {
        brokerType: 'client',
        supportedBrokerTypes: scmRulesToTest,
        accept: 'accept.json.sample',
        filterRulesPath: {},
      };
      config[camelcase(`BROKER_DOWNSTREAM_TYPE_${folder}`)] = 'true';
      const loadedRules = loadFilterRules(
        config,
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_APPRISK;
      delete process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`];
      delete process.env.ACCEPT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid ACCEPT_CUSTOM_PR_TEMPLATES rules - Testing %s',
    (folder) => {
      process.env.ACCEPT_CUSTOM_PR_TEMPLATES = 'true';
      process.env.ACCEPT = 'accept.json';
      process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`] = 'true';
      const config: CONFIGURATION = {
        brokerType: 'client',
        supportedBrokerTypes: scmRulesToTest,
        accept: 'accept.json.sample',
        filterRulesPath: {},
      };
      config[camelcase(`BROKER_DOWNSTREAM_TYPE_${folder}`)] = 'true';
      const loadedRules = loadFilterRules(
        config,
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CUSTOM_PR_TEMPLATES;
      delete process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`];
      delete process.env.ACCEPT;
    },
  );
});
