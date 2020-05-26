const replace = require('./replace-vars');

module.exports = ({scheme, token, bearer, username, password}) => {
  const config = require('./config');

  if (scheme === 'token') {
    return `Token ${replace(token, config)}`;
  }
  if (scheme === 'basic') {
    const basicAuth = [replace(username, config), replace(password, config)].join(':');
    return `Basic ${new Buffer(basicAuth).toString('base64')}`;
  }
  if (scheme === 'bearer') {
    return `Bearer ${replace(bearer, config)}`;
  }
};
