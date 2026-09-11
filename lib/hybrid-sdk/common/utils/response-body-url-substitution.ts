import { isJson } from './json';

/**
 * RES_BODY_URL_SUB can change response byte length, so applicable responses
 * cannot retain the downstream Content-Length as authoritative metadata.
 * Streaming senders must decide before knowing whether a literal URL matched;
 * applicability is therefore enough to invalidate the downstream length
 * without buffering. Buffered senders may replace it with the known final
 * transformed byte length.
 */
export const getResponseBodyUrlSubstitutionPolicy = (
  config,
  responseHeaders,
) => {
  const applies = Boolean(config.RES_BODY_URL_SUB) && isJson(responseHeaders);
  if (!applies) {
    return { applies, headers: responseHeaders };
  }

  const headers = { ...responseHeaders };
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'content-length') {
      delete headers[name];
    }
  }

  return { applies, headers };
};
