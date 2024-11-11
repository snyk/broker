import { LOADEDFILTERSET } from '../../lib/common/types/filter';
const nock = require('nock');
import { retrieveAndLoadFilters } from '../../lib/client/utils/filterLoading';
import { ClientOpts } from '../../lib/common/types/options';
import {
  getFilterConfig,
  setFilterConfig,
} from '../../lib/client/config/filters';

const scmRulesToTest = [
  'azure-repos',
  'bitbucket-server',
  'bitbucket-server-bearer-auth',
  'github',
  'github-enterprise',
  'gitlab',
];

const rulesetSourceInvalidHostname = 'http://invalid.broker-rules.snyk.io';

describe('filter Rules Loading', () => {
  beforeAll(() => {
    nock(`${rulesetSourceInvalidHostname}`)
      .persist()
      .get(/./)
      .reply(() => {
        return [404];
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
    'Handle gracefully failure to download ruleset - Testing %s',
    async (folder) => {
      const loadedFilters: Map<string, LOADEDFILTERSET> = new Map();
      const dummyFilter: LOADEDFILTERSET = {
        private: () => {
          return false;
        },
        public: () => {
          return false;
        },
      };
      loadedFilters.set(folder, dummyFilter);
      setFilterConfig({ loadedFilters });
      expect(getFilterConfig()).toStrictEqual({ loadedFilters });
      const filterRulePath = {};
      filterRulePath[folder] = `${rulesetSourceInvalidHostname}/${folder}.json`;

      const cfg: ClientOpts = {
        port: 0,
        config: {
          brokerType: 'client',
          supportedBrokerTypes: [`${folder}`],
          filterRulesPaths: filterRulePath,
          universalBrokerEnabled: true,
        },
        filters: new Map(),
      };
      await expect(retrieveAndLoadFilters(cfg)).rejects.toThrowError(
        `Error downloading filter ${folder}. Url http://invalid.broker-rules.snyk.io/${folder}.json returned 404`,
      );
      // Loaded Filters remain unchanged
      expect(getFilterConfig()).toStrictEqual({ loadedFilters });
    },
  );
});
