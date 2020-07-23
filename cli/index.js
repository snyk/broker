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

const command = args._[0];
if (command === 'init') {
  const templateName = args._[1];
  init(templateName).then(() => process.exit(0));
} else {
  exec(args);
}
