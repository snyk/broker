import { format, parse } from 'url';
import { log as logger } from '../logs/logger';
import {
  gitHubCommitSigningEnabled,
  gitHubTreeCheckNeeded,
  signGitHubCommit,
  validateGitHubTreePayload,
} from '../hybrid-sdk/client/scm';
import { computeContentLength } from './content-length';
import {
  contentLengthHeader,
  contentTypeHeader,
  urlencoded,
} from './headers-value-constants';

import { getConfigForIdentifier } from '../hybrid-sdk/common/config/universal';
import { TestResult } from '../hybrid-sdk/common/types/filter';
import version from '../hybrid-sdk/common/utils/version';

export interface PostFilterPreparingRequestError {
  status: number;
  errorMsg: string;
}

export interface PostFilterPreparedRequest {
  url: string;
  headers: Object;
  method: string;
  body?: any;
  timeoutMs?: number;
}

export const prepareRequest = async (
  result: TestResult,
  payload,
  logContext,
  options,
  brokerToken,
  socketType,
) => {
  let errorPreparing: PostFilterPreparingRequestError | null = null;
  if (result.url.startsWith('http') === false) {
    result.url = 'https://' + result.url;
    logContext.resultUrlSchemeAdded = true;
  }

  logContext.httpUrl = result.url;

  if (!payload.headers['user-agent']) {
    payload.headers['user-agent'] = 'Snyk Broker ' + version;
    logContext.userAgentHeaderSet = true;
  }

  if (result.auth) {
    payload.headers['authorization'] = result.auth;
    logContext.authHeaderSetByRuleAuth = true;
  } else {
    const parsed = parse(result.url);
    if (parsed.auth) {
      // if URL contains basic auth,
      // remove authorization header to prefer auth on the URL.
      if (parsed.auth.includes(':')) {
        delete payload.headers['authorization'];
      }

      // if URL contains token auth,
      // put the token in the authorization header
      // instead of on the URL.
      else {
        payload.headers['authorization'] = `token ${parsed.auth}`;
        // then strip from the url
        parsed.auth = null;
        result.url = format(parsed);
      }

      logContext.authHeaderSetByRuleUrl = true;
    }
  }

  // remove headers that we don't want to relay
  // (because they corrupt the request)
  const headersToRemove = [
    'x-forwarded-for',
    'x-forwarded-proto',
    'content-length',
    'host',
    'x-forwarded-host',
    'x-forwarded-port',
    'snyk-acting-group-public-id',
    'snyk-acting-org-public-id',
    'snyk-acting-user-public-id',
    'snyk-flow-name',
    'snyk-product-line',
    'snyk-project-type',
    'snyk-integration-type',
  ];
  Object.keys(payload.headers).map((header) => {
    if (headersToRemove.includes(header.toLowerCase())) {
      delete payload.headers[header];
    }
  });

  if (options.config.removeXForwardedHeaders === 'true') {
    for (const key in payload.headers) {
      if (key.startsWith('x-forwarded-')) {
        delete payload.headers[key];
      }
    }

    if (payload.headers['forwarded']) {
      delete payload.headers['forwarded'];
    }
  }

  if (brokerToken && socketType === 'server') {
    Object.assign(payload.headers, { 'X-Broker-Token': brokerToken });
  }

  logger.debug(logContext, '[Relay] Preparing Downstream Request');

  // Sometimes we receive the body as a {type, data} object
  // Unsure why - possibly Primus?
  if (payload.body?.type === 'Buffer')
    payload.body = Buffer.of(payload.body.data);

  // TODO: Move github commit signing to a plugin
  if (
    gitHubTreeCheckNeeded(options.config, {
      method: payload.method,
      url: payload.url,
    })
  ) {
    try {
      validateGitHubTreePayload(payload.body);
    } catch (error: any) {
      logger.error(
        { error },
        'error while checking github tree payload for symlinks',
      );
      errorPreparing = {
        status: 401,
        errorMsg: error.message,
      };
    }
  }

  if (
    gitHubCommitSigningEnabled(
      options.config.universalBrokerEnabled
        ? getConfigForIdentifier(brokerToken, options.config)
        : options.config,
      {
        method: payload.method,
        url: payload.url,
      },
    )
  ) {
    try {
      payload.body = await signGitHubCommit(
        options.config.universalBrokerEnabled
          ? getConfigForIdentifier(brokerToken, options.config)
          : options.config,
        payload.body,
      );
    } catch (error) {
      logger.error({ error }, 'error while signing github commit');
    }
  }
  // TODO: Move github commit signing to a plugin

  payload.headers['connection'] = 'Keep-Alive';
  payload.headers['Keep-Alive'] = 'timeout=60, max=1000';
  if (
    payload.headers &&
    payload.headers['x-broker-content-type'] === urlencoded
  ) {
    //avoid duplication for content-type headers
    Object.keys(payload.headers).forEach((header) => {
      if (header.toLowerCase() === contentTypeHeader) {
        delete payload.headers[header];
      }
    });
    payload.headers[contentTypeHeader] = urlencoded;
    if (payload.body) {
      const jsonBody = JSON.parse(payload.body) as Record<string, any>;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(jsonBody)) {
        params.append(key, value.toString());
      }
      payload.body = params.toString();
    }
  }

  payload.headers[contentLengthHeader] = computeContentLength(payload);

  if (options.config && options.config.LOG_ENABLE_BODY === 'true') {
    logContext.requestBody = payload.body;
  }
  logContext.requestHeaders = payload.headers;
  logger.debug(logContext, 'Prepared request');

  const req: PostFilterPreparedRequest = {
    url: result.url,
    headers: payload.headers,
    method: payload.method,
  };
  if (payload.body) {
    req.body = payload.body;
  }
  return { req, error: errorPreparing };
};
