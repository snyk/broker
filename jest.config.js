module.exports = {
  preset: 'ts-jest',
  testRunner: 'jest-circus/runner',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/test/tsconfig.json',
    },
  },
  collectCoverage: false, // Enabled by running `npm run test:coverage`
  collectCoverageFrom: ['src/**/*.{js,ts}'],
  coverageReporters: ['text-summary', 'html'],
  coverageDirectory: '<rootDir>/reports/coverage',
  verbose: true,
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/reports/jest',
      },
    ],
  ],
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/test/.*fixtures', '<rootDir>/dist/.*'],
  testTimeout: 20_000, // Raise the default timeout from 5s to 20s
};
