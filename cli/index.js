#!/usr/bin/env node
const clite = require('clite');
clite({
  commands: {
    client: 'lib/client',
    server: 'lib/server',
    _: 'cli/client',
  },
  options: ['env'],
  alias: { e: 'env', d: 'dev', V: 'verbose' },
  booleans: [
    'verbose',
    'dev',
  ],
  help: 'usage.txt',
});
