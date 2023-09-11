import version from '../utils/version';
import {
  gitHubCommitSigningEnabled,
  gitHubTreeCheckNeeded,
  signGitHubCommit,
  validateGitHubTreePayload,
} from '../../client/scm';

import { parse } from 'url';
import { format } from 'url';
import tryJSONParse from '../utils/try-json-parse';
import undefsafe from 'undefsafe';
import { replace } from '../utils/replace-vars';
import { log as logger } from '../../logs/logger';
import { RequestPayload } from '../types/http';
import { LogContext } from '../types/log';
import { ClientOpts } from '../../client/types/client';
import { ServerOpts } from '../../server/types/http';
import { TestResult } from '../filter/filtersAsync';

export interface PostFilterPreparedRequest {
  origin: string;
  path: string;
  url: string;
  headers: Object;
  method: string;
  body: Object;
}

export interface PostFilterPreparingRequestError {
  status: number;
  errorMsg: string;
}

export const prepareRequestFromFilterResult = async (
  result: TestResult,
  payload: RequestPayload,
  logContext: LogContext,
  options: ClientOpts | ServerOpts,
  brokerToken: string,
  socketType,
) => {
  let errorPreparing: PostFilterPreparingRequestError | null = null;
  if (
    !result.url.includes('localhost') &&
    result.url.startsWith('http') === false
  ) {
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
        source = replace(source, options.config); // replace the variables
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
      source = replace(source, options.config); // replace the variables
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

  // Sometimes we receive the body as a {type, data} object
  // Unsure why - possibly Primus?
  if (payload.body?.type === 'Buffer')
    payload.body = Buffer.of(payload.body.data);

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
    gitHubCommitSigningEnabled(options.config, {
      method: payload.method,
      url: payload.url,
    })
  ) {
    try {
      payload.body = await signGitHubCommit(options.config, payload.body);
    } catch (error) {
      logger.error({ error }, 'error while signing github commit');
    }
  }
  const req: PostFilterPreparedRequest = {
    origin: new URL(result.url).origin,
    path: payload.url.replace(new URL(result.url).origin, ''),
    url: result.url,
    headers: payload.headers,
    method: payload.method,
    body: payload.body,
  };
  return { req, error: errorPreparing };
};
