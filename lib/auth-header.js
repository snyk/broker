const replace = require('./replace-vars');

// Not standardized Basic auth format, currently using in Azure Repos API
function getEncodedTokenBasedBasicAuth(token, config) {
  return Buffer.from(replace(token, config)).toString('base64');
}

function getEncodedBasicAuth(username, password, config) {
  return Buffer.from(
    `${replace(username, config)}:${replace(password, config)}`,
  ).toString('base64');
}

module.exports = ({ scheme, token, username, password }) => {
  const config = require('./config');

  if (scheme === 'token') {
    return `Token ${replace(token, config)}`;
  }
  if (scheme === 'basic') {
    const basicAuth = token
      ? getEncodedTokenBasedBasicAuth(token, config)
      : getEncodedBasicAuth(username, password, config);

    return `Basic ${basicAuth}`;
  }
};
