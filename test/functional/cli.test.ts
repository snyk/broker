import { promises as fsp, readFileSync } from 'fs';
import { dir, setGracefulCleanup } from 'tmp-promise';

describe('CLI', () => {
  afterAll(() => {
    delete process.env.BROKER_TOKEN;
    delete process.env.BROKER_SERVER_URL;
  });
  describe('"exec" command', () => {
    beforeEach(() => {
      delete process.env.BROKER_TOKEN;
      delete process.env.BROKER_SERVER_URL;
    });

    it('throws when missing broker id', async () => {
      const exec = await import('../../cli/exec');
      try {
        await exec.default({ _: ['client'], port: 8010 });
        expect(true).toBeFalsy(); // safety check: should fail is the call above doesn't throw
      } catch (err) {
        expect(err).toEqual(
          new ReferenceError(
            'No Filters found. A Broker requires filters to run. Shutting down.',
          ),
        );
      }
    });
  });
  describe('"exec" command', () => {
    beforeAll(() => {
      delete process.env.BROKER_TOKEN;
      delete process.env.BROKER_SERVER_URL;
    });

    it('cli throws when missing broker server', async () => {
      process.env.BROKER_TOKEN = '1';
      const exec = await import('../../cli/exec');
      try {
        await exec.default({ _: ['client'], port: 8020 });
        expect(true).toBeFalsy(); // safety check: should fail is the call above doesn't throw
      } catch (err) {
        expect(err).toEqual(
          new ReferenceError(
            'No Filters found. A Broker requires filters to run. Shutting down.',
          ),
        );
      }
    });
  });

  describe('"init" command', () => {
    const templates = [['bitbucket-server'], ['github'], ['gitlab']];

    beforeAll(() => {
      setGracefulCleanup(); // always remove temporary directories
    });

    afterEach(() => {
      const originalWorkDir = process.cwd();

      process.chdir(originalWorkDir);
    });
    afterAll(() => {
      delete process.env.BROKER_SERVER_URL;
    });

    it.each(templates)('creates files from %p template', async (template) => {
      const templateDir = await dir({ unsafeCleanup: true });
      const currentDir = process.cwd();
      process.chdir(templateDir.path);
      const init = await import('../../cli/init');
      await init.default(template);

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
      process.chdir(currentDir);
    });
  });
});
