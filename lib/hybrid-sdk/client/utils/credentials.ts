import { log as logger } from '../../../logs/logger';
import { sanitise } from '../../../logs/logger';
import { HttpResponse, makeRequestToDownstream } from '../../http/request';
import { isJson } from '../../common/utils/json';

const credsFromHeader = (s: string) => {
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
  brokerClientValidationMethod: string,
  brokerClientValidationTimeoutMs: number,
  // isJsonResponse,
) => {
  const data = {
    brokerClientValidationUrl: sanitise(config.brokerClientValidationUrl),
    brokerClientValidationMethod,
    brokerClientValidationTimeoutMs,
  };

  const validationRequestHeaders = {};
  if (auth) {
    validationRequestHeaders['authorization'] = auth;
  }

  let errorOccurred = true;
  // This was originally `request`, but `await` is a lot easier to understand than nested callback hell.
  try {
    const response = await makeRequestToDownstream({
      url: config.brokerClientValidationUrl,
      headers: validationRequestHeaders,
      method: brokerClientValidationMethod,
    });

    // test logic requires to surface internal data
    // which is best not exposed in production

    const responseStatusCode = response && response.statusCode;
    if (!responseStatusCode) {
      logger.error(
        { response },
        'Failed systemcheck, unexpected response code',
      );
      throw new Error('Failed systemcheck');
    }
    data['brokerClientValidationUrlStatusCode'] = responseStatusCode;

    // check for 2xx status code

    if (responseStatusCode > 300) {
      data['ok'] = false;
      data['error'] =
        responseStatusCode === 401 || responseStatusCode === 403
          ? 'Failed due to invalid credentials'
          : 'Status code is not 2xx';

      logger.error(data, response && response.body, 'Systemcheck failed');
    } else {
      const parsedBodyResponse = isJson(response.headers)
        ? JSON.parse(response.body)
        : response.body;

      response.body = parsedBodyResponse;
      if (process.env.JEST_WORKER_ID) {
        data['testResponse'] = response;
      }

      errorOccurred = false;
      data['ok'] = true;
    }
  } catch (error) {
    // test logic requires to surface internal data
    // which is best not exposed in production
    if (process.env.JEST_WORKER_ID) {
      data['testError'] = error;
    }
    data['ok'] = false;
    data['error'] = error;
  }

  return { data, errorOccurred };
};

export const checkBitbucketPatCredentials = async (
  auth, // This would be the BITBUCKET_PAT token, likely passed as the authorization header value
  config,
  brokerClientValidationMethod: string,
  brokerClientValidationTimeoutMs: number,
) => {
  const data: {
    brokerClientValidationUrl: string;
    brokerClientValidationMethod: string;
    brokerClientValidationTimeoutMs: number;
    ok: boolean;
    brokerClientValidationUrlStatusCode?: number;
    error?: string | Error;
  } = {
    brokerClientValidationUrl: sanitise(config.brokerClientValidationUrl),
    brokerClientValidationMethod,
    brokerClientValidationTimeoutMs,
    ok: false,
  };

  const validationRequestHeaders = {};
  if (auth) {
    validationRequestHeaders['authorization'] = auth;
  }

  let errorOccurred = true;

  try {
    const response = await makeRequestToDownstream({
      url: config.brokerClientValidationUrl,
      headers: validationRequestHeaders,
      method: brokerClientValidationMethod,
    });

    const responseStatusCode = response && response.statusCode;
    if (!responseStatusCode) {
      logger.error(
        { response },
        'Failed Bitbucket PAT systemcheck, missing status code',
      );
      throw new Error('Failed Bitbucket PAT systemcheck');
    } else {
      data['brokerClientValidationUrlStatusCode'] = responseStatusCode;

      if (responseStatusCode >= 300) {
        data['error'] =
          responseStatusCode === 401 || responseStatusCode === 403
            ? 'Failed due to invalid credentials'
            : `Status code is not 2xx`;
        logger.error(
          data,
          response && response.body,
          'Bitbucket PAT systemcheck failed',
        );
      } else {
        // Status code from bitbucket server will always be 200,
        // now we check for the x-ausername header which tells us if
        // the auth actually succeeded
        if (response.headers && response.headers['x-ausername']) {
          logger.info('Bitbucket PAT systemcheck credentials are valid');
          data['ok'] = true;
          errorOccurred = false;
        } else {
          data['brokerClientValidationUrlStatusCode'] = 401;
          data['error'] =
            'Bitbucket PAT systemcheck failed, credentials are invalid';
          logger.error(
            data,
            'Bitbucket PAT systemcheck failed, credentials are invalid , x-ausername header missing',
          );
          data['ok'] = false;
          errorOccurred = true;
        }

        const parsedBodyResponse = isJson(response.headers)
          ? JSON.parse(response.body)
          : response.body;
        response.body = parsedBodyResponse;

        if (process.env.JEST_WORKER_ID) {
          data['testResponse'] = response;
        }
      }
    }
  } catch (error: unknown) {
    logger.error(
      { err: error instanceof Error ? error.message : undefined },
      'Bitbucket PAT systemcheck failed due to an exception.',
    );
    if (process.env.JEST_WORKER_ID) {
      data['testError'] = error;
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Systemcheck failed due to an exception';
    data['error'] = errorMessage;
  }

  return { data, errorOccurred };
};

type SystemCheckResult = {
  success: boolean;
  data: {
    data: unknown;
    statusCode: number | undefined;
  };
};
/**
 * Bitbucket server will always reply with 200 status code for valid and invalid credentials.
 * We have to check for the `x-ausername` header presense which tells if the auth actually succeeded.
 */
export const validateResponseForBitbucketPAT = (
  response: HttpResponse,
): SystemCheckResult => {
  const result: SystemCheckResult = {
    success: false,
    data: {
      data: {},
      statusCode: undefined,
    },
  };

  const statusCode = response && response.statusCode;
  if (!statusCode) {
    logger.error(
      { response },
      'Failed Bitbucket PAT systemcheck, missing status code',
    );
    throw new Error('Failed Bitbucket PAT systemcheck');
  }

  result.success = statusCode >= 200 && statusCode < 300;
  result.data.statusCode = statusCode;

  if (statusCode >= 300) {
    result.data.data =
      statusCode === 401 || statusCode === 403
        ? 'Failed due to invalid credentials'
        : 'Status code is not 2xx';
  } else {
    if (response.headers && response.headers['x-ausername']) {
      // presence of 'x-ausername' header which tells us if the auth actually succeeded
      result.data.data = response.body;
    } else {
      logger.error(
        {},
        'Bitbucket PAT systemcheck failed, credentials are invalid , x-ausername header missing',
      );

      result.success = false;
      result.data = {
        data: 'Bitbucket PAT systemcheck failed, credentials are invalid',
        statusCode: 401,
      };
    }
  }

  return result;
};
