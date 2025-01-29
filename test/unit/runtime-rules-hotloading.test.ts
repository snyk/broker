import path from 'path';
import loadFilterRules from '../../lib/common/filter/filter-rules-loading';
import camelcase from 'camelcase';
import { FiltersType } from '../../lib/common/types/filter';
const nock = require('nock');
import fs from 'fs';
import { CONFIGURATION } from '../../lib/common/types/options';

const scmRulesToTest = [
  'azure-repos',
  'bitbucket-server',
  'bitbucket-server-bearer-auth',
  'github',
  'github-enterprise',
  'gitlab',
];
const scmUniversalRulesToTest = [
  'azure-repos',
  'bitbucket-server',
  'bitbucket-server-bearer-auth',
  'github',
  'github-enterprise',
  'github-server-app',
  'github-cloud-app',
  'gitlab',
];

const rulesetSourceHostname = 'http://broker-rules.snyk.io';

describe('filter Rules Loading', () => {
  beforeAll(() => {
    nock(`${rulesetSourceHostname}`)
      .persist()
      .get(/./)
      .reply((uri) => {
        const filename = path.basename(uri);
        const fileContent = fs.readFileSync(
          `defaultFilters/${filename}`,
          'utf-8',
        );
        return [200, fileContent];
      });
  });
  beforeEach(() => {
    jest.resetModules();
    process.env.ACCEPT = 'accept.json';
  });

  afterEach(() => {
    delete process.env.ACCEPT;
  });

  test.each(scmRulesToTest)(
    'Loads normal accept file - Testing %s',
    async (folder) => {
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );
      expect(loadedRules).toMatchSnapshot();
    },
  );

  test.each(scmRulesToTest)(
    'Loads custom accept file - Testing %s',
    async (folder) => {
      const loadedRules = await loadFilterRules({
        brokerType: 'client',
        supportedBrokerTypes: [],
        accept: `client-templates/${folder}/accept.json.sample`,
        filterRulesPaths: {},
      });
      expect(loadedRules).toMatchSnapshot();
    },
  );

  test.each(scmRulesToTest)(
    'Loads universal rules - Testing %s',
    async (folder) => {
      const loadedRules = await loadFilterRules({
        brokerType: 'client',
        supportedBrokerTypes: [`${folder}`],
        filterRulesPaths: {
          'azure-repos': `${rulesetSourceHostname}/azure-repos.json`,
          'bitbucket-server': `${rulesetSourceHostname}/bitbucket-server.json`,
          'bitbucket-server-bearer-auth': `${rulesetSourceHostname}/bitbucket-server-bearer-auth.json`,
          'github-enterprise': `${rulesetSourceHostname}/github-enterprise.json`,
          'github-server-app': `${rulesetSourceHostname}/github-server-app.json`,
          'github-cloud-app': `${rulesetSourceHostname}/github-cloud-app.json`,
          github: `${rulesetSourceHostname}/github.json`,
          gitlab: `${rulesetSourceHostname}/gitlab.json`,
        },
        universalBrokerEnabled: true,
      });

      const loadedRulesForType = loadedRules as Map<string, FiltersType>;
      expect(loadedRulesForType[folder]).toMatchSnapshot();
    },
  );

  test.each(scmRulesToTest)(
    'Skip injection if no or invalid IAC extensions - Testing %s',
    async (folder) => {
      process.env.ACCEPT_IAC = 'rf';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid IAC extensions - Testing %s',
    async (folder) => {
      process.env.ACCEPT_IAC = 'tf,yaml, json,yml,tpl';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid IAC extensions - Testing %s',
    async (folder) => {
      process.env.ACCEPT_IAC = 'tf,json';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
    },
  );

  test.each(scmRulesToTest)(
    'Disabling Injection of valid IAC extensions - Testing %s',
    async (folder) => {
      process.env.ACCEPT_IAC = 'false';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_IAC;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid CODE rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_CODE = 'true';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CODE;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid Git rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_GIT = 'true';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_GIT;
    },
  );

  test.each(scmRulesToTest)(
    'Disabling Injection of valid Git rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_GIT = 'false';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_GIT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid Git rules without snippets - Testing %s',
    async (folder) => {
      process.env.ACCEPT_GIT = 'true';
      process.env.DISABLE_SNIPPETS = 'true';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: scmRulesToTest,
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(
        loadedRules['private'].filter(
          (x) => x['//'] === 'needed to load code snippets',
        ),
      ).toHaveLength(0);

      for (const rule of [
        {
          name: 'allow git-upload-pack (for git clone)',
          path: '*/git-upload-pack',
        },
        { name: 'allow info refs (for git clone)', path: '*/info/refs*' },
      ]) {
        const filteredRule = loadedRules['private'].filter(
          (x) => x['//'] === rule.name,
        );
        expect(filteredRule).toHaveLength(1);
        expect(filteredRule[0].path).toEqual(rule.path);
      }
      delete process.env.ACCEPT_GIT;
      delete process.env.DISABLE_SNIPPETS;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid CODE GH rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_LARGE_MANIFESTS = 'true';

      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_LARGE_MANIFESTS;
    },
  );

  test.each(scmRulesToTest)(
    'Disable Injection of valid CODE GH rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_LARGE_MANIFESTS = 'false';

      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_LARGE_MANIFESTS;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid CODE rules and IAC extensions (yaml only) - Testing %s',
    async (folder) => {
      process.env.ACCEPT_CODE = 'true';
      process.env.ACCEPT_IAC = 'yaml';
      const loadedRules = await loadFilterRules(
        {
          brokerType: 'client',
          supportedBrokerTypes: [],
          accept: 'accept.json.sample',
          filterRulesPaths: {},
        },
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CODE;
      delete process.env.ACCEPT_IAC;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid AppRisk rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_ESSENTIALS = 'true';
      process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`] = 'true';
      const config: CONFIGURATION = {
        brokerType: 'client',
        supportedBrokerTypes: scmRulesToTest,
        accept: 'accept.json.sample',
        filterRulesPaths: {},
      };
      config[camelcase(`BROKER_DOWNSTREAM_TYPE_${folder}`)] = 'true';
      const loadedRules = await loadFilterRules(
        config,
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_ESSENTIALS;
      delete process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`];
    },
  );

  test.each(scmRulesToTest)(
    'Disabling Injection of valid AppRisk rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_ESSENTIALS = 'false';
      process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`] = 'true';
      const config: CONFIGURATION = {
        brokerType: 'client',
        supportedBrokerTypes: scmRulesToTest,
        accept: 'accept.json.sample',
        filterRulesPaths: {},
      };
      config[camelcase(`BROKER_DOWNSTREAM_TYPE_${folder}`)] = 'true';
      const loadedRules = await loadFilterRules(
        config,
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_ESSENTIALS;
      delete process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`];
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid ACCEPT_CUSTOM_PR_TEMPLATES rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_CUSTOM_PR_TEMPLATES = 'true';
      process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`] = 'true';
      const config: CONFIGURATION = {
        brokerType: 'client',
        supportedBrokerTypes: scmRulesToTest,
        accept: 'accept.json.sample',
        filterRulesPaths: {},
      };
      config[camelcase(`BROKER_DOWNSTREAM_TYPE_${folder}`)] = 'true';
      const loadedRules = await loadFilterRules(
        config,
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CUSTOM_PR_TEMPLATES;
      delete process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`];
    },
  );

  test.each(scmRulesToTest)(
    'Disabling Injection of valid ACCEPT_CUSTOM_PR_TEMPLATES rules - Testing %s',
    async (folder) => {
      process.env.ACCEPT_CUSTOM_PR_TEMPLATES = 'false';
      process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`] = 'true';
      const config: CONFIGURATION = {
        brokerType: 'client',
        supportedBrokerTypes: scmRulesToTest,
        accept: 'accept.json.sample',
        filterRulesPaths: {},
      };
      config[camelcase(`BROKER_DOWNSTREAM_TYPE_${folder}`)] = 'true';
      const loadedRules = await loadFilterRules(
        config,
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_CUSTOM_PR_TEMPLATES;
      delete process.env[`BROKER_DOWNSTREAM_TYPE_${folder}`];
    },
  );

  test.each(scmUniversalRulesToTest)(
    'Injection of valid Git rules - Universal Broker - Testing %s',
    async (folder) => {
      process.env.ACCEPT_GIT = 'true';
      const filterRulesPath = {};
      for (const type of scmUniversalRulesToTest) {
        filterRulesPath[`${type}`] = `defaultFilters/${type}.json`;
      }
      const loadedRules = await loadFilterRules({
        brokerType: 'client',
        supportedBrokerTypes: scmUniversalRulesToTest,
        filterRulesPaths: filterRulesPath,
        universalBrokerEnabled: true,
      });

      expect(
        loadedRules[folder].private.filter((x) =>
          x.path.includes('*/git-upload-pack'),
        ),
      ).toHaveLength(1);
      if (['github-server-app', 'github-cloud-app'].includes(folder)) {
        expect(
          loadedRules[folder].private.filter((x) =>
            x.origin.includes('x-access-token'),
          ),
        ).toHaveLength(2);
        expect(
          loadedRules[folder].private.filter(
            (x) => x.origin.includes('x-access-token') && x.auth,
          ),
        ).toHaveLength(0);
        expect(
          loadedRules[folder].private.filter(
            (x) =>
              x.auth?.token === '${JWT_TOKEN}' &&
              x['//'] === 'needed to load code snippets',
          ),
        ).toHaveLength(0);
      }
      expect(loadedRules).toMatchSnapshot();
      delete process.env.ACCEPT_GIT;
    },
  );

  test.each(scmRulesToTest)(
    'Injection of valid Git rules with AppRisk enabled - Testing %s',
    async (folder) => {
      process.env.ACCEPT_GIT = 'true';
      process.env.ACCEPT_ESSENTIALS = 'true';
      const config: CONFIGURATION = {
        brokerType: 'client',
        supportedBrokerTypes: scmRulesToTest,
        accept: 'accept.json.sample',
        filterRulesPaths: {},
      };
      config[camelcase(`BROKER_DOWNSTREAM_TYPE_${folder}`)] = 'true';
      const loadedRules = await loadFilterRules(
        config,
        path.join(__dirname, '../..', `client-templates/${folder}`),
      );

      for (const rule of [
        'allow git-upload-pack (for git clone)',
        'allow info refs (for git clone)',
        'needed to load code snippets',
      ]) {
        expect(
          loadedRules['private'].filter((x) => x['//'] === rule),
        ).toHaveLength(1);
      }
      delete process.env.ACCEPT_GIT;
      delete process.env.ACCEPT_ESSENTIALS;
    },
  );
});
