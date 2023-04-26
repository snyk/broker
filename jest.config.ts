import type { Config } from 'jest';

const config: Config = {
  bail: 1,
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/test/tsconfig.json',
    },
  },
  maxWorkers: 1,
  modulePathIgnorePatterns: ['<rootDir>/dist'],
  preset: 'ts-jest',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 20_000,
  verbose: true,
};
export default config;
