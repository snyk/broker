import { readFileSync } from 'fs';
import * as path from 'path';
import * as loadFilterRules from '../../lib/filter-rules-loading';

function loadFixture(name: string) {
  const fixturePath = path.join(__dirname, '..', 'fixtures', name);
  const fixture = readFileSync(fixturePath, { encoding: 'utf-8' });

  return fixture;
}

describe('filter Rules Loading', () => {
  it('Loads normal accept file', () => {
    const rules = JSON.parse(loadFixture(path.join('accept', 'ghe.json')));
    const loadedRules = loadFilterRules(
      'ghe.json',
      path.join(__dirname, '..', 'fixtures/accept'),
    );

    expect(loadedRules).toEqual(rules);
  });
});
