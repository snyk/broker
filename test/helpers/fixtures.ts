import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_FIXTURES_ROOT: string = path.resolve(__dirname, '..', 'fixtures');

export class Fixtures {
  /**
   * Returns content of a fixtures file from the fixtures folder.
   * Default fixtures folder is `<projectRoot>/test/fixtures/`.
   */
  static get(fileName: string, fixturesRoot = DEFAULT_FIXTURES_ROOT): string {
    return fs.readFileSync(path.resolve(fixturesRoot, fileName), {
      encoding: 'utf-8',
    });
  }

  static getPathToClientFixtures(): string {
    return path.resolve(DEFAULT_FIXTURES_ROOT, 'client');
  }

  static getPathToServerFixtures(): string {
    return path.resolve(DEFAULT_FIXTURES_ROOT, 'server');
  }
}
