module.exports = {
  commands: {
    client: 'cli/client',
    server: 'cli/server',
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
