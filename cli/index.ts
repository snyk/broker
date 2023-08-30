#!/usr/bin/env node
import exec from './exec';
import init from './init';
import minimist from 'minimist';
import { help } from './help';

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
