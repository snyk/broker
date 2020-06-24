#!/usr/bin/env node
const clite = require('clite');
clite({
  commands: {
    init: 'dist/cli/init',
    _: 'dist/cli/exec',
  },
  options: ['env', 'port'],
  alias: { V: 'verbose', 'v': 'version' },
  booleans: [
    'verbose',
  ],
  help: 'usage.txt',
});
