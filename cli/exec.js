const commands = ['server', 'client'];

module.exports = (args) => {
  const command = args._[0] || 'client';
  if (!commands.includes(command)) {
    throw new Error(`unknown command "${command}"`);
  }

  if (args.verbose) {
    require('debug').enable('broker*');
  }

  args.client = command === 'client';

  require(`${__dirname}/../lib/index`).main(args);
};
