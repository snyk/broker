import { loadBrokerConfig } from '../../../../../../lib/hybrid-sdk/common/config/config';
import { getConfigForConnection } from '../../../../../../lib/hybrid-sdk/common/config/universal';

describe('common/config/universal.ts', () => {
  beforeAll(async () => {
    await loadBrokerConfig();
  });

  describe('getConfigForConnection()', () => {
    const getValidationAuth = (
      type: string,
      credentials: Record<string, string>,
    ) => {
      const config = {
        connections: {
          connection: { type, ...credentials },
        },
      };

      return getConfigForConnection('connection', config).validations?.[0].auth;
    };

    it('should use basic auth for a Jira connection without a PAT', () => {
      expect(
        getValidationAuth('jira', {
          JIRA_USERNAME: 'jira-user',
          JIRA_PASSWORD: 'jira-password',
        }),
      ).toEqual({
        type: 'basic',
        username: '$JIRA_USERNAME',
        password: '$JIRA_PASSWORD',
      });
    });

    it('should use bearer auth for a Jira connection with a PAT', () => {
      expect(getValidationAuth('jira', { JIRA_PAT: 'jira-pat' })).toEqual({
        type: 'header',
        name: 'Authorization',
        value: 'Bearer $JIRA_PAT',
      });
    });

    it('should use basic auth for a Bitbucket Server connection without a PAT', () => {
      expect(
        getValidationAuth('bitbucket-server', {
          BITBUCKET_USERNAME: 'bitbucket-user',
          BITBUCKET_PASSWORD: 'bitbucket-password',
        }),
      ).toEqual({
        type: 'basic',
        username: '$BITBUCKET_USERNAME',
        password: '$BITBUCKET_PASSWORD',
      });
    });

    it('should use bearer auth for a Bitbucket Server connection with a PAT', () => {
      expect(
        getValidationAuth('bitbucket-server', {
          BITBUCKET_PAT: 'bitbucket-pat',
        }),
      ).toEqual({
        type: 'header',
        name: 'Authorization',
        value: 'Bearer $BITBUCKET_PAT',
      });
    });
  });
});
