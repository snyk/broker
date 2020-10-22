const { replace } = require('./replace-vars');

module.exports = ({ scheme, token, username, password }) => {
  const config = require('./config');

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
