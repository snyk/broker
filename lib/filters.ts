import minimatch from 'minimatch';
import pathRegexp from 'path-to-regexp';
import qs from 'qs';
import path from 'path';
import undefsafe from 'undefsafe';
import { replace } from './replace-vars';
import authHeader from './auth-header';
import tryJSONParse from './try-json-parse';
import { log as logger } from './log';
import { RequestPayload } from './relay';
import { config } from './config';

interface AuthObject {
  scheme: string;
  username?: string;
  password?: string;
  token?: string;
}
interface ValidEntryObject {
  path?: string;
  value?: string;
  queryParam?: string;
  values?: Array<string>;
  regex?: string;
  header?: string;
}
interface Rule {
  method: string;
  origin: string;
  path: string;
  valid?: ValidEntryObject[];
  requiredCapabilities?: Array<string>;
  stream?: boolean;
  auth?: AuthObject;
}

export interface FiltersType {
  private: Rule[];
  public: Rule[];
}

interface TestResult {
  url: any;
  auth: any;
  stream: boolean | undefined;
}

const validateHeaders = (headerFilters, requestHeaders = []) => {
  for (const filter of headerFilters) {
    const headerValue = requestHeaders[filter.header];

    if (!headerValue) {
      return false;
    }

    if (!filter.values.includes(headerValue)) {
      return false;
    }
  }

  return true;
};

// reads config that defines
export default (ruleSource) => {
  let rules: Array<Rule> = [];

  // polymorphic support
  if (Array.isArray(ruleSource)) {
    rules = ruleSource;
  } else if (ruleSource) {
    try {
      rules = require(ruleSource);
    } catch (error) {
      logger.warn(
        { ruleSource, error },
        'Unable to parse rule source, ignoring',
      );
    }
  }

  if (!Array.isArray(rules)) {
    throw new Error(
      `Expected array of filter rules, got '${typeof rules}' instead.`,
    );
  }

  logger.info({ rulesCount: rules.length }, 'loading new rules');

  // array of entries with
  const tests = rules.map((entry) => {
    const keys: pathRegexp.Key[] = [];

    let {
      method,
      origin, // eslint-disable-line prefer-const
      path: entryPath,
      valid, // eslint-disable-line prefer-const
      requiredCapabilities, // eslint-disable-line prefer-const
    } = entry;
    const baseOrigin = origin;
    const { stream } = entry;
    method = (method || 'get').toLowerCase();

    const bodyFilters = valid ? valid.filter((v) => !!v.path && !v.regex) : [];
    const bodyRegexFilters = valid
      ? valid.filter((v) => !!v.path && !!v.regex)
      : [];
    const queryFilters = valid ? valid.filter((v) => !!v.queryParam) : [];
    const headerFilters = valid ? valid.filter((v) => !!v.header) : [];

    // now track if there's any values that we need to interpolate later
    const fromConfig = {};

    // slightly bespoke version of replace-vars.js
    entryPath = (entryPath || '').replace(/(\${.*?})/g, (_, match) => {
      const key = match.slice(2, -1); // ditch the wrappers
      fromConfig[key] = config[key] || '';
      return ':' + key;
    });

    if (entryPath[0] !== '/') {
      entryPath = '/' + entryPath;
    }

    logger.debug({ method, path: entryPath }, 'adding new filter rule');
    const regexp = pathRegexp(entryPath, keys);

    return (req) => {
      // check the request method
      if (req.method.toLowerCase() !== method && method !== 'any') {
        return false;
      }

      // Do not allow directory traversal
      if (path.normalize(req.url) !== req.url) {
        return false;
      }

      // Discard any fragments before further processing
      const mainURI = req.url.split('#')[0];

      // query params might contain additional "?"s, only split on the 1st one
      const parts = mainURI.split('?');
      let [url, querystring] = [parts[0], parts.slice(1).join('?')];
      const res = regexp.exec(url);
      if (!res) {
        // no url match
        return false;
      }

      // reconstruct the url from the user config
      for (let i = 1; i < res.length; i++) {
        const val = fromConfig[keys[i - 1].name];
        if (val) {
          url = url.replace(res[i], val);
        }
      }

      // if validity filters are present, at least one must be satisfied
      if (
        bodyFilters.length ||
        bodyRegexFilters.length ||
        queryFilters.length
      ) {
        let isValid;

        let parsedBody;
        if (bodyFilters.length) {
          parsedBody = tryJSONParse(req.body);

          // validate against the body
          isValid = bodyFilters.some(({ path: filterPath, value }) => {
            return undefsafe(parsedBody, filterPath, value);
          });
        }

        if (!isValid && bodyRegexFilters.length) {
          parsedBody = parsedBody || tryJSONParse(req.body);

          // validate against the body by regex
          isValid = bodyRegexFilters.some(({ path: filterPath, regex }) => {
            try {
              const re = new RegExp(regex!); //paths without regexes got filtered out earlier, hence the !
              return re.test(undefsafe(parsedBody, filterPath));
            } catch (error) {
              logger.error(
                { error, path: filterPath, regex },
                'failed to test regex rule',
              );
              return false;
            }
          });
        }

        // no need to check query filters if the request is already valid
        if (!isValid && queryFilters.length) {
          const parsedQuerystring = qs.parse(querystring);

          // validate against the querystring
          isValid = queryFilters.every(({ queryParam, values }) => {
            // ! because the value is not undefined, queryFilters length to be non zero and array filtered earlier
            return values!.some((value) =>
              // ! because the queryParam is not undefined, queryFilters length to be non zero and array filtered earlier
              minimatch(parsedQuerystring[queryParam!] || '', value, {
                dot: true,
              }),
            );
          });
        }

        if (!isValid) {
          return false;
        }
      }

      if (headerFilters.length) {
        if (!validateHeaders(headerFilters, req.headers)) {
          return false;
        }
      }

      if (requiredCapabilities) {
        let matchedAll = true;
        for (const c of requiredCapabilities) {
          if (!req?.locals?.capabilities.includes(c)) {
            matchedAll = false;
            logger.warn(
              {
                path: entryPath,
                capability: c,
                clientCapabilities: req?.locals?.capabilities,
              },
              'client does not report support for capability',
            );
          }
        }
        if (!matchedAll) {
          // We have to throw to avoid it getting approved by a generic matcher later on
          throw new Error(
            'client does not support all required capabilities for endpoint',
          );
        }
      }

      const origin = replace(baseOrigin, config);
      logger.debug(
        { path: entryPath, origin, url, querystring },
        'rule matched',
      );

      querystring = querystring ? `?${querystring}` : '';

      return {
        url: origin + url + querystring,
        auth: entry.auth && authHeader(entry.auth),
        stream,
      };
    };
  });

  return (payload: RequestPayload, callback) => {
    let res: boolean | TestResult = false;
    logger.debug({ rulesCount: tests.length }, 'looking for a rule match');

    try {
      for (const test of tests) {
        res = test(payload);
        if (res) {
          break;
        }
      }
    } catch (e: unknown) {
      logger.warn({ error: e }, 'caught error checking request against rules');
      res = false;
    }
    if (!res) {
      return callback(Error('blocked'));
    }

    return callback(null, res);
  };
};
