import { promises as fsp, readFileSync } from 'fs';
import { setGracefulCleanup, dir } from 'tmp-promise';
import * as init from '../../cli/init';

describe('CLI init', () => {
  const templates = [['bitbucket-server'], ['github'], ['gitlab']];

  beforeAll(() => {
    setGracefulCleanup(); // always remove temporary directories
  });

  afterEach(() => {
    const originalWorkDir = process.cwd();

    process.chdir(originalWorkDir);
  });

  it.each(templates)('creates files from %p template', async (template) => {
    const templateDir = await dir({ unsafeCleanup: true });
    process.chdir(templateDir.path);

    await init({ _: [template] });

    const stats = await Promise.all([
      fsp.stat('.env'),
      fsp.stat('accept.json'),
    ]);

    for (const stat of stats) {
      expect(stat).toEqual(expect.anything());
    }

    expect(() =>
      JSON.parse(readFileSync('accept.json', { encoding: 'utf-8' })),
    ).not.toThrowError();
  });
});
