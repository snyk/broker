const commands = ['server', 'client'];

module.exports = async (args) => {
  const command = args._[0] || 'client';
  if (!commands.includes(command)) {
    throw new Error(`unknown command "${command}"`);
  }

  args.client = command === 'client';

  await require(`${__dirname}/../lib/index`).main(args);
};
