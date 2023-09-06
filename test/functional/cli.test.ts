import { promises as fsp, readFileSync } from 'fs';
import { dir, setGracefulCleanup } from 'tmp-promise';
import exec from '../../cli/exec';
import init from '../../cli/init';

describe('CLI', () => {
  describe('"init" command', () => {
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

      await init(template);

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

  describe('"exec" command', () => {
    it('throws when missing broker id', async () => {
      try {
        await exec({ _: ['client'], port: 8010 });
      } catch (err) {
        expect(err).toEqual(
          new ReferenceError(
            'BROKER_TOKEN is required to successfully identify itself to the server',
          ),
        );
      }
    });

    it('cli throws when missing broker server', async () => {
      process.env.BROKER_TOKEN = '1';

      try {
        await exec({ _: ['client'], port: 8020 });
      } catch (err) {
        expect(err).toEqual(
          new ReferenceError(
            'BROKER_TOKEN is required to successfully identify itself to the server',
          ),
        );
      }
    });
  });
});
