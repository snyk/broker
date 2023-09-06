import { RequestPayload } from '../types/http';
import { LogContext } from '../types/log';
import { hashToken, maskToken } from '../utils/token';
import { log as logger } from '../../logs/logger';
import { BrokerServerPostResponseHandler } from '../http/server-stream-posts';
import { incrementWebSocketRequestsTotal } from '../utils/metrics';
import version from '../utils/version';
import {
  gitHubCommitSigningEnabled,
  gitHubTreeCheckNeeded,
  signGitHubCommit,
  validateGitHubTreePayload,
} from '../../client/scm';
import { logError, logResponse } from '../../logs/log';
import { isJson } from '../utils/json';
import { replace, replaceUrlPartialChunk } from '../utils/replace-vars';
import { parse } from 'url';
import { format } from 'url';
import tryJSONParse from '../utils/try-json-parse';
import undefsafe from 'undefsafe';
import request from 'request';
import { config } from '../config';
import Filters from '../filter/filters';
import { ClientOpts } from '../../client/types/client';
import { ServerOpts } from '../../server/types/http';

let relayRequest = request;
relayRequest = request.defaults({
  ca: config.caCert,
  timeout: process.env.BROKER_DOWNSTREAM_TIMEOUT
    ? parseInt(process.env.BROKER_DOWNSTREAM_TIMEOUT)
    : 60000,
  agentOptions: {
    keepAlive: true,
    keepAliveMsecs: 60000,
    maxTotalSockets: 1000,
  },
});

export const forwardWebSocketRequest = (
  options: ClientOpts | ServerOpts,
  io?,
) => {
  // 1. Request coming in over websocket conn (logged)
  // 2. Filter for rule match (log and block if no match)
  // 3. Relay over HTTP conn (logged)
  // 4. Get response over HTTP conn (logged)
  // 5. Send response over websocket conn

  const filters = Filters(options.filters?.private);

  return (brokerToken) => (payload: RequestPayload, emit) => {
    const requestId = payload.headers['snyk-request-id'];
    const logContext: LogContext = {
      url: payload.url,
      requestMethod: payload.method,
      requestHeaders: payload.headers,
      requestId,
      streamingID: payload.streamingID,
      maskedToken: maskToken(brokerToken),
      hashedToken: hashToken(brokerToken),
      transport: io?.socket?.transport?.name ?? 'unknown',
    };

    if (!requestId) {
      // This should be a warning but older clients won't send one
      // TODO make this a warning when significant majority of clients are on latest version
      logger.trace(
        logContext,
        'Header Snyk-Request-Id not included in headers passed through',
      );
    }

    const realEmit = emit;
    emit = (responseData, isResponseFromRequestModule = false) => {
      // This only works client -> server, it's not possible to post data server -> client
      logContext.requestMethod = '';
      logContext.requestHeaders = {};
      if (io?.capabilities?.includes('receive-post-streams')) {
        const postHandler = new BrokerServerPostResponseHandler(
          logContext,
          options.config,
          brokerToken,
          payload.streamingID,
          options.config.serverId,
          requestId,
        );
        if (isResponseFromRequestModule) {
          logger.trace(
            logContext,
            'posting streaming response back to Broker Server',
          );
          postHandler.forwardRequest(responseData);
        } else {
          // Only for responses generated internally in the Broker Client/Server
          postHandler.sendData(responseData);
        }
      } else {
        if (payload.streamingID) {
          if (isResponseFromRequestModule) {
            legacyStreaming(
              logContext,
              responseData,
              options.config,
              io,
              payload.streamingID,
            );
          } else {
            io.send('chunk', payload.streamingID, '', false, {
              status: responseData.status,
              headers: responseData.headers,
            });
            io.send(
              'chunk',
              payload.streamingID,
              JSON.stringify(responseData.body),
              true,
            );
          }
        } else {
          logger.trace(
            { ...logContext, responseData },
            'sending fixed response over WebSocket connection',
          );
          realEmit(responseData);
        }
      }
    };

    logger.info(logContext, 'received request over websocket connection');

    filters(payload, async (filterError, result) => {
      if (filterError) {
        incrementWebSocketRequestsTotal(true);
        const reason =
          'Response does not match any accept rule, blocking websocket request';
        logContext.error = filterError;
        filterError.reason = reason;
        logger.warn(logContext, reason);
        return emit({
          status: 401,
          body: {
            message: filterError.message,
            reason,
            url: payload.url,
          },
        });
      }
      incrementWebSocketRequestsTotal(false);

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

      if (brokerToken && io?.socketType === 'server') {
        Object.assign(payload.headers, { 'X-Broker-Token': brokerToken });
      }

      logger.debug(
        logContext,
        'sending websocket request over HTTP connection',
      );

      // Sometimes we receive the body as a {type, data} object
      // Unsure why - possibly Primus?
      if (payload.body?.type === 'Buffer')
        payload.body = Buffer.of(payload.body.data);

      // Request library is buggy and will throw an error if we're POST'ing an empty body without an explicit Content-Length header
      if (!payload.body || payload.body.length === 0) {
        payload.headers['Content-Length'] = '0';
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
          return emit({
            status: 401,
            body: error.message,
          });
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

      const req = {
        url: result.url,
        headers: payload.headers,
        method: payload.method,
        body: payload.body,
      };

      // check if this is a streaming request for binary data
      if (payload.streamingID) {
        logger.debug(logContext, 'serving stream request');

        try {
          emit(relayRequest(req), true);
        } catch (e) {
          logger.error(
            {
              ...logContext,
              error: e,
              stackTrace: new Error('stacktrace generator').stack,
            },
            'caught error sending HTTP response over WebSocket',
          );
        }
        return;
      }

      relayRequest(req, (error, response, responseBody) => {
        if (error) {
          logError(logContext, error);
          return emit({
            status: 500,
            body: error.message,
          });
        }

        const contentLength = responseBody.length;
        // Note that the other side of the request will also check the length and will also reject it if it's too large
        // Set to 20MB even though the server is 21MB because the server looks at the total data travelling through the websocket,
        // not just the size of the body, so allow 1MB for miscellaneous data (e.g., headers, Primus overhead)
        const maxLength =
          parseInt(options.config.socketMaxResponseLength) || 20971520;
        if (contentLength && contentLength > maxLength) {
          const errorMessage = `body size of ${contentLength} is greater than max allowed of ${maxLength} bytes`;
          logError(logContext, {
            errorMessage,
          });
          return emit({
            status: 502,
            errorType: 'BODY_TOO_LARGE',
            originalBodySize: contentLength,
            body: {
              message: errorMessage,
            },
          });
        }

        const status = (response && response.statusCode) || 500;
        if (options.config.RES_BODY_URL_SUB && isJson(response.headers)) {
          const replaced = replaceUrlPartialChunk(
            responseBody,
            null,
            options.config,
          );
          responseBody = replaced.newChunk;
        }
        logResponse(logContext, status, response, options.config);
        emit({ status, body: responseBody, headers: response.headers });
      });
    });
  };
};

const legacyStreaming = (logContext, rqst, config, io, streamingID) => {
  let prevPartialChunk;
  let isResponseJson;
  logger.warn(
    logContext,
    'server did not advertise received-post-streams capability - falling back to legacy streaming',
  );
  // Fall back to older streaming method if somehow connected to older server version
  rqst
    .on('response', (response) => {
      const status = (response && response.statusCode) || 500;
      logResponse(logContext, status, response, config);
      isResponseJson = isJson(response.headers);
      io.send('chunk', streamingID, '', false, {
        status,
        headers: response.headers,
      });
    })
    .on('data', (chunk) => {
      if (config.RES_BODY_URL_SUB && isResponseJson) {
        const { newChunk, partial } = replaceUrlPartialChunk(
          Buffer.from(chunk).toString(),
          prevPartialChunk,
          config,
        );
        prevPartialChunk = partial;
        chunk = newChunk;
      }
      io.send('chunk', streamingID, chunk, false);
    })
    .on('end', () => {
      io.send('chunk', streamingID, '', true);
    })
    .on('error', (error) => {
      logError(logContext, error);
      io.send('chunk', streamingID, error.message, true, {
        status: 500,
      });
    });
};
