import { log as logger } from '../../logs/logger';
import version from '../../common/utils/version';
import { sanitise } from '../../logs/logger';
import rp from 'request-promise-native';

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
  isJsonResponse,
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

  let errorOccurred = true;
  // This was originally `request`, but `await` is a lot easier to understand than nested callback hell.
  await rp({
    url: config.brokerClientValidationUrl,
    headers: validationRequestHeaders,
    method: brokerClientValidationMethod,
    timeout: brokerClientValidationTimeoutMs,
    json: isJsonResponse,
    resolveWithFullResponse: true,
    agentOptions: {
      ca: config.caCert, // Optional CA cert
    },
  })
    .then((response) => {
      // test logic requires to surface internal data
      // which is best not exposed in production
      if (process.env.JEST_WORKER_ID) {
        data['testResponse'] = response;
      }

      const responseStatusCode = response && response.statusCode;
      data['brokerClientValidationUrlStatusCode'] = responseStatusCode;

      // check for 2xx status code
      const goodStatusCode = /^2/.test(responseStatusCode);
      if (!goodStatusCode) {
        data['ok'] = false;
        data['error'] =
          responseStatusCode === 401 || responseStatusCode === 403
            ? 'Failed due to invalid credentials'
            : 'Status code is not 2xx';

        logger.error(data, response && response.body, 'Systemcheck failed');
        return;
      }

      errorOccurred = false;
      data['ok'] = true;
    })
    .catch((error) => {
      // test logic requires to surface internal data
      // which is best not exposed in production
      if (process.env.JEST_WORKER_ID) {
        data['testError'] = error;
      }

      data['ok'] = false;
      data['error'] = error.message;
    });

  return { data, errorOccurred };
};
