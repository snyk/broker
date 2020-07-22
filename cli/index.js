#!/usr/bin/env node
const exec = require('./exec');
const init = require('./init');
const minimist = require('minimist');
const { help } = require('./help');

const args = minimist(process.argv.slice(2), {
  boolean: ['help'],
  alias: {
    h: 'help',
  },
});

if (args.help) {
  console.info(help);

  process.exit(0);
}

if (args._[0] === 'init') {
  init(args._[1]).then(() => process.exit(0));
}

if (args._.length === 0) {
  exec(args);
}
