import { type IncomingHttpHeaders } from 'http';
import { getConfig } from '../../common/config/config';
import { maskToken } from '../../common/utils/token';
import { log as logger } from '../../../logs/logger';
import { PostFilterPreparedRequest } from '../../../broker-workload/prepareRequest';
import { makeSingleRawRequestToDownstream } from '../../http/request';

const AUTHORIZATION_HEADER = 'authorization';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const BROKER_CLIENT_ID_HEADER = 'x-snyk-broker-client-id';
const BROKER_CLIENT_ROLE_HEADER = 'x-snyk-broker-client-role';
const SNYK_REQUEST_ID_HEADER = 'snyk-request-id';

function getHeader(
  headers: IncomingHttpHeaders,
  headerName: string,
): string | undefined {
  const header = headers[headerName];
  if (Array.isArray(header)) {
    return header[0];
  }
  return header;
}

function getTlsOptions(
  isInternalJWT: boolean,
): PostFilterPreparedRequest['tlsOptions'] {
  if (isInternalJWT) return {};

  const tlsOptionName = process.env.GATEWAY_TLS_OPTION_NAME;
  const tlsOptionValue = process.env.GATEWAY_TLS_OPTION_VALUE;
  if (tlsOptionName) {
    return {
      [tlsOptionName]: tlsOptionValue === 'false' ? false : true,
    };
  }
  return {};
}

function getHeaderOptions(authHeader: string) {
  const requestHeaders: Record<string, string> = {
    authorization: authHeader,
    'Content-type': 'application/vnd.api+json',
  };

  const gatewayHeaderName = process.env.GATEWAY_HEADER_NAME;
  const gatewayHeaderValue = process.env.GATEWAY_HEADER_VALUE;
  if (gatewayHeaderName) {
    requestHeaders[gatewayHeaderName] = gatewayHeaderValue ?? '';
  }

  return requestHeaders;
}

export interface ValidatedBrokerCredentials {
  brokerClientId: string;
  credentials: string;
  role: string;
}

export const validateBrokerClientCredentials = async (
  headers: IncomingHttpHeaders,
  brokerConnectionIdentifier: string,
  isInternalJWT = false,
  brokerClientId?: string,
): Promise<ValidatedBrokerCredentials> => {
  const authHeader = getHeader(headers, AUTHORIZATION_HEADER);
  brokerClientId =
    brokerClientId ?? getHeader(headers, BROKER_CLIENT_ID_HEADER);
  const role = getHeader(headers, BROKER_CLIENT_ROLE_HEADER) ?? '';
  const requestId = getHeader(headers, SNYK_REQUEST_ID_HEADER) ?? '';
  const maskedToken = maskToken(brokerConnectionIdentifier);

  logger.debug(
    { maskedToken, brokerClientId, requestId },
    `Validating auth for connection ${brokerConnectionIdentifier} client Id ${brokerClientId}, role ${role}.`,
  );

  if (
    !authHeader ||
    !authHeader.toLowerCase().startsWith('bearer') ||
    !brokerClientId
  ) {
    throw new BrokerAuthError('Missing required authorization header.');
  }

  const credentials = authHeader.substring(authHeader.indexOf(' ') + 1);
  if (!credentials) {
    logger.debug(
      { maskedToken, brokerClientId, requestId },
      `Denied auth for connection ${brokerConnectionIdentifier} client Id ${brokerClientId}, role ${role}.`,
    );
    throw new BrokerAuthError('Invalid JWT.');
  }

  const body = {
    data: {
      type: 'broker_connection',
      attributes: {
        broker_client_id: brokerClientId,
      },
    },
  };

  const hostname = isInternalJWT
    ? getConfig().authorizationService
    : process.env.GATEWAY_HOSTNAME;
  const tlsOptions = getTlsOptions(isInternalJWT);
  const requestHeaders = getHeaderOptions(authHeader);

  const xForwardedFor = getHeader(headers, FORWARDED_FOR_HEADER);
  if (xForwardedFor !== undefined) {
    requestHeaders[FORWARDED_FOR_HEADER] = xForwardedFor;
  }

  const req: PostFilterPreparedRequest = {
    url: `${hostname}/hidden/brokers/connections/${brokerConnectionIdentifier}/auth/validate?version=2024-02-08~experimental`,
    headers: requestHeaders,
    method: 'POST',
    body: JSON.stringify(body),
    tlsOptions,
  };
  const response = await makeSingleRawRequestToDownstream(req);
  logger.debug(
    {
      maskedToken,
      validationResponseCode: response.statusCode,
      requestId,
    },
    'Validate Broker Client Credentials response',
  );
  if (response.statusCode !== 201) {
    logger.debug(
      {
        statusCode: response.statusCode,
        message: response.statusText,
        requestId,
      },
      `Broker ${brokerConnectionIdentifier} client ID ${brokerClientId} failed validation.`,
    );
    throw new BrokerAuthError('Invalid credentials.');
  }

  logger.debug(
    { maskedToken, brokerClientId },
    `Successful auth for connection ${brokerConnectionIdentifier} client Id ${brokerClientId}, role ${role}.`,
  );

  return { brokerClientId, credentials, role };
};

export class BrokerAuthError extends Error {}
