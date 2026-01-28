import { readFileSync } from 'fs';
import path from 'path';

import { loadFilters } from '../../lib/hybrid-sdk/common/filter/filtersAsync';

function loadDefaultFilter(name: string) {
  const filterPath = path.join(__dirname, '../../', 'defaultFilters', name);
  return readFileSync(filterPath, { encoding: 'utf-8' });
}

describe('defaultFilters/azure-repos.json', () => {
  it('allows pullRequests (capital R variant) endpoint', () => {
    const rules = JSON.parse(loadDefaultFilter('azure-repos.json'));
    const filter = loadFilters(rules.private, 'default', {});

    const res = filter({
      url: '/org/_apis/git/repositories/repo/pullRequests/123',
      method: 'GET',
      headers: {},
    } as any);

    expect(res).not.toBe(false);
    expect((res as any).path).toContain('/pullRequests/');
  });
});
