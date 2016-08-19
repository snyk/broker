const commands = ['server', 'client'];

module.exports = (args) => {
  const command = args._[0] || 'client';
  if (!commands.includes(command)) {
    throw new Error(`unknown command "${command}"`);
  }

  if (args.logs) {
    require('debug').enable('broker');
  }

  require(`${__dirname}/../lib/${command}`)(args);
};
