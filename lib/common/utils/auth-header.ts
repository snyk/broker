import { replace } from './replace-vars';
import { config } from '../config';
// Not standardized Basic auth format, currently using in Azure Repos API
export const getEncodedTokenBasedBasicAuth = (token, config) => {
  return Buffer.from(replace(token, config)).toString('base64');
};

export const getEncodedBasicAuth = (username, password, config) => {
  return Buffer.from(
    `${replace(username, config)}:${replace(password, config)}`,
  ).toString('base64');
};

export default ({ scheme, token = '', username = '', password = '' }) => {
  if (scheme === 'token') {
    return `Token ${replace(token, config)}`;
  }

  if (scheme === 'bearer') {
    return `Bearer ${replace(token, config)}`;
  }

  if (scheme === 'basic') {
    const basicAuth = token
      ? getEncodedTokenBasedBasicAuth(token, config)
      : getEncodedBasicAuth(username, password, config);

    return `Basic ${basicAuth}`;
  }
};
