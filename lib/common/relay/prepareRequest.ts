import { format, parse } from 'url';
import { TestResult } from '../types/filter';
import version from '../utils/version';
import tryJSONParse from '../utils/try-json-parse';
import { replace } from '../utils/replace-vars';
import undefsafe from 'undefsafe';
import { log as logger } from '../../logs/logger';
import {
  gitHubCommitSigningEnabled,
  gitHubTreeCheckNeeded,
  signGitHubCommit,
  validateGitHubTreePayload,
} from '../../client/scm';
import { getConfigForIdentifier } from '../config/universal';

export interface PostFilterPreparingRequestError {
  status: number;
  errorMsg: string;
}

export interface PostFilterPreparedRequest {
  url: string;
  headers: Object;
  method: string;
  body?: any;
}

export const prepareRequestFromFilterResult = async (
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

  // if the request is all good - and at this point it is, we'll check
  // whether we want to do variable substitution on the body
  //
  // Variable substitution - for those who forgot - is substituting a part
  // of a given string (e.g. "${SOME_ENV_VAR}/rest/of/string")
  // with an env var of the same name (SOME_ENV_VAR).
  // This is used (for example) to substitute the snyk url
  // with the broker's url when defining the target for an incoming webhook.
  if (!options.config.disableBodyVarsSubstitution && payload.body) {
    const parsedBody = tryJSONParse(payload.body);

    if (parsedBody.BROKER_VAR_SUB) {
      logContext.bodyVarsSubstitution = parsedBody.BROKER_VAR_SUB;
      for (const path of parsedBody.BROKER_VAR_SUB) {
        let source = undefsafe(parsedBody, path); // get the value
        source = replace(
          source,
          options.config.universalBrokerEnabled
            ? getConfigForIdentifier(brokerToken, options.config)
            : options.config,
        ); // replace the variables
        undefsafe(parsedBody, path, source); // put it back in
      }
      payload.body = JSON.stringify(parsedBody);
    }
  }

  if (
    !options.config.disableHeaderVarsSubstitution &&
    payload.headers &&
    payload.headers['x-broker-var-sub']
  ) {
    // check whether we want to do variable substitution on the headers
    logContext.headerVarsSubstitution = payload.headers['x-broker-var-sub'];
    for (const path of payload.headers['x-broker-var-sub'].split(',')) {
      let source = undefsafe(payload.headers, path.trim()); // get the value
      source = replace(
        source,
        options.config.universalBrokerEnabled
          ? getConfigForIdentifier(brokerToken, options.config)
          : options.config,
      ); // replace the variables
      undefsafe(payload.headers, path.trim(), source); // put it back in
    }
  }

  // remove headers that we don't want to relay
  // (because they corrupt the request)
  [
    'x-forwarded-for',
    'x-forwarded-proto',
    'content-length',
    'host',
    'accept-encoding',
    'content-encoding',
  ].map((_) => delete payload.headers[_]);

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

  // Request library is buggy and will throw an error if we're POST'ing an empty body without an explicit Content-Length header
  if (!payload.body || payload.body.length === 0) {
    payload.headers['Content-Length'] = '0';
  } else {
    payload.headers['Content-length'] = payload.body.length;
  }

  payload.headers['connection'] = 'Keep-Alive';
  payload.headers['Keep-Alive'] = 'timeout=60, max=1000';

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
  if (
    payload.headers &&
    payload.headers['x-broker-content-type'] ===
      'application/x-www-form-urlencoded'
  ) {
    payload.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (payload.body) {
      const jsonBody = JSON.parse(payload.body) as Record<string, any>;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(jsonBody)) {
        params.append(key, value.toString());
      }
      payload.body = params.toString();
    }
  }

  if (options.config && options.config.LOG_ENABLE_BODY === 'true') {
    logContext.requestBody = payload.body;
  }
  logContext.requestHeaders = payload.headers;
  logger.debug(logContext, 'Prepared request');

  const req = {
    url: result.url,
    headers: payload.headers,
    method: payload.method,
    body: payload.body,
  };
  return { req, error: errorPreparing };
};