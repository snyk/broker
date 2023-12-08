import { app } from '../lib/index';

const commands = ['server', 'client'];

export default async (args) => {
  const command = args._[0] || 'client';
  if (!commands.includes(command)) {
    throw new Error(`unknown command "${command}"`);
  }

  args.client = command === 'client';
  if (!args.config) {
    args.config = {};
  }
  await app(args);
};
