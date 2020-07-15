const replace = require('./replace-vars');
const { config } = require('./config');

module.exports = ({ scheme, token, username, password }) => {
  if (scheme === 'token') {
    return `Token ${replace(token, config)}`;
  }
  if (scheme === 'basic') {
    const basicAuth = [
      replace(username, config),
      replace(password, config),
    ].join(':');
    return `Basic ${Buffer.from(basicAuth).toString('base64')}`;
  }
};
