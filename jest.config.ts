import type { Config } from 'jest';

export default async (): Promise<Config> => {
  process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL || 'fatal';

  return {
    bail: 1,
    maxConcurrency: 1,
    maxWorkers: 1,
    reporters: ['default', ['jest-junit', { outputDirectory: 'reports' }]],
    rootDir: 'test',
    // keep old format: https://jestjs.io/blog/2022/08/25/jest-29
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true,
    },
    testRegex: '.*\\.test\\.ts$',
    testEnvironment: 'node',
    testTimeout: 20_000,
    transform: {
      '^.+\\.(t|j)s$': 'ts-jest',
    },
    moduleNameMapper: {
      '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    verbose: true,
  };
};
