module.exports = {
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
};
