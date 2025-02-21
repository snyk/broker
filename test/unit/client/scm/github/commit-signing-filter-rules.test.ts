import { getCommitSigningGitHubFilterRules } from '../../../../../lib/hybrid-sdk/client/scm/github/commit-signing-filter-rules';

describe('client/scm/github/commit-signing-filter-rules.ts', () => {
  describe('getCommitSigningGitHubFilterRules()', () => {
    it('should load commit signing rules correctly', async () => {
      const rules = getCommitSigningGitHubFilterRules();

      expect(rules).toMatchSnapshot();
    });
  });
});
