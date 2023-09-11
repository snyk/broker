import { log as logger } from '../../logs/logger';
import version from '../../common/utils/version';
import { sanitise } from '../../logs/logger';
import { request } from 'undici';

const credsFromHeader = (s) => {
  if (s.indexOf(' ') >= 0) {
    return s.substring(s.indexOf(' ') + 1);
  } else {
    return s;
  }
};

export const loadCredentialsFromConfig = (config) => {
  let auths: any = [];
  let rawCreds: any = [];
  if (config.brokerClientValidationAuthorizationHeaderPool) {
    auths = config.brokerClientValidationAuthorizationHeaderPool;
    rawCreds =
      config.brokerClientValidationAuthorizationHeaderPool.map(credsFromHeader);
  } else if (config.brokerClientValidationBasicAuthPool) {
    auths = config.brokerClientValidationBasicAuthPool.map(
      (s) => `Basic ${Buffer.from(s).toString('base64')}`,
    );
    rawCreds = config.brokerClientValidationBasicAuthPool;
  } else if (config.brokerClientValidationAuthorizationHeader) {
    auths.push(config.brokerClientValidationAuthorizationHeader);
    rawCreds.push(config.brokerClientValidationAuthorizationHeader);
    rawCreds = rawCreds.map(credsFromHeader);
  } else if (config.brokerClientValidationBasicAuth) {
    auths.push(
      `Basic ${Buffer.from(config.brokerClientValidationBasicAuth).toString(
        'base64',
      )}`,
    );
    rawCreds.push(config.brokerClientValidationBasicAuth);
  }
  return { auths, rawCreds };
};

export const checkCredentials = async (
  auth,
  config,
  brokerClientValidationMethod,
  brokerClientValidationTimeoutMs,
) => {
  const data = {
    brokerClientValidationUrl: sanitise(config.brokerClientValidationUrl),
    brokerClientValidationMethod,
    brokerClientValidationTimeoutMs,
  };

  const validationRequestHeaders = {
    'user-agent': 'Snyk Broker client ' + version,
  };
  if (auth) {
    validationRequestHeaders['authorization'] = auth;
  }

  let errorOccurred = false;
  try {
    const response = await request(config.brokerClientValidationUrl, {
      headers: validationRequestHeaders,
      method: brokerClientValidationMethod,
      bodyTimeout: brokerClientValidationTimeoutMs,
    });
    const responseStatusCode = response && response.statusCode;
    data['brokerClientValidationUrlStatusCode'] = responseStatusCode;
    if (responseStatusCode >= 200 && responseStatusCode < 300) {
      // test logic requires to surface internal data
      // which is best not exposed in production
      if (process.env.JEST_WORKER_ID) {
        data['testResponse'] = {
          headers: response.headers,
          body: await response.body.json(),
        };
      }
      data['ok'] = true;
    } else if (responseStatusCode >= 300) {
      data['ok'] = false;
      data['error'] =
        responseStatusCode === 401 || responseStatusCode === 403
          ? 'Failed due to invalid credentials'
          : 'Status code is not 2xx';
      logger.error(data, 'Systemcheck failed');
      errorOccurred = true;
    }
  } catch {
    (error) => {
      // test logic requires to surface internal data
      // which is best not exposed in production
      if (process.env.JEST_WORKER_ID) {
        data['testError'] = error;
      }
      data['ok'] = false;
      data['error'] = error.message || 'Error occurred checking credentials';
      errorOccurred = true;
    };
  }
  return { data, errorOccurred };
};
