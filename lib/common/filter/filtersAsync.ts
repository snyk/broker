import minimatch from 'minimatch';
import pathRegexp from 'path-to-regexp';
import qs from 'qs';
import path from 'path';
import undefsafe from 'undefsafe';
import { replace } from '../utils/replace-vars';
import authHeader from '../utils/auth-header';
import tryJSONParse from '../utils/try-json-parse';
import { log as logger } from '../../logs/logger';
import { RequestPayload } from '../types/http';
import {
  LOADEDFILTERSET,
  LOADEDFILTER,
  FILTER,
  FiltersType,
  Rule,
  TestResult,
} from '../types/filter';
import { validateHeaders } from './utils';
import {
  getConfigForType,
  overloadConfigWithConnectionSpecificConfig,
} from '../config/universal';

export const loadAllFilters = (
  filters: Map<string, FiltersType> | FiltersType,
  configFromApp,
): Map<string, LOADEDFILTERSET> | LOADEDFILTERSET => {
  const filtersKeys = Object.keys(filters);
  if (filtersKeys.includes('public')) {
    const classicFilters = filters as FiltersType;
    return {
      public: loadFilters(classicFilters.public, 'default', configFromApp),
      private: loadFilters(classicFilters.private, 'default', configFromApp),
    };
  } else {
    const filtersMap = new Map<string, LOADEDFILTERSET>();
    for (let i = 0; i < filtersKeys.length; i++) {
      logger.info(
        { type: filtersKeys[i] },
        `Loading ruleset (private + public rules) for ${filtersKeys[i]}`,
      );
      const loadedFilterSet = {
        public: loadFilters(
          filters[filtersKeys[i]].public,
          filtersKeys[i],
          configFromApp,
        ),
        private: loadFilters(
          filters[filtersKeys[i]].private,
          filtersKeys[i],
          configFromApp,
        ),
      };
      filtersMap.set(filtersKeys[i], loadedFilterSet);
      logger.info(
        { type: filtersKeys[i] },
        `Loaded ${filters[filtersKeys[i]].private.length} private & ${
          filters[filtersKeys[i]].public.length
        } public rules`,
      );
    }
    return filtersMap;
  }
};

// reads config that defines
export const loadFilters: LOADEDFILTER = (
  ruleSource: Rule[],
  type?: string,
  configFromApp?,
): FILTER => {
  let rules: Array<Rule> = [];

  // polymorphic support
  if (Array.isArray(ruleSource)) {
    rules = ruleSource;
  } else if (ruleSource) {
    logger.error({ ruleSource }, 'Unable to parse rule source, ignoring');
    throw new Error(
      `Expected array of filter rules, got '${typeof rules}' instead.`,
    );
  }

  logger.debug(
    { rulesCount: rules.length },
    `loading new rules ${type ? 'for ' + type + '.' : '.'}`,
  );
  // array of entries with
  const tests = rules.map((entry) => {
    const keys: pathRegexp.Key[] = [];

    let {
      method,
      origin, // eslint-disable-line prefer-const
      path: entryPath,
      valid, // eslint-disable-line prefer-const
    } = entry;
    const baseOrigin = origin;
    method = (method || 'get').toLowerCase();

    const bodyFilters = valid ? valid.filter((v) => !!v.path && !v.regex) : [];
    const bodyRegexFilters = valid
      ? valid.filter((v) => !!v.path && !!v.regex)
      : [];
    const queryFilters = valid ? valid.filter((v) => !!v.queryParam) : [];
    const headerFilters = valid ? valid.filter((v) => !!v.header) : [];

    // now track if there's any values that we need to interpolate later
    const fromConfig = {};
    // load config from config.default.json based on type and config.universal.json based on token
    let localConfig =
      type && configFromApp?.universalBrokerEnabled
        ? Object.assign({}, getConfigForType(type), configFromApp)
        : configFromApp;
    // slightly bespoke version of replace-vars.js
    entryPath = (entryPath || '').replace(/(\${.*?})/g, (_, match) => {
      const key = match.slice(2, -1); // ditch the wrappers
      fromConfig[key] = localConfig[key] || '';
      return ':' + key;
    });

    if (entryPath[0] !== '/') {
      entryPath = '/' + entryPath;
    }

    logger.debug({ method, path: entryPath }, 'adding new filter rule');
    const regexp = pathRegexp(entryPath, keys);

    return (req) => {
      if (
        configFromApp?.brokerType === 'client' &&
        configFromApp?.universalBrokerEnabled &&
        req.connectionIdentifier
      ) {
        localConfig = overloadConfigWithConnectionSpecificConfig(
          req.connectionIdentifier,
          localConfig,
        );
      }

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

      const origin = replace(baseOrigin, localConfig);
      logger.debug(
        { path: entryPath, origin, url, querystring },
        'rule matched',
      );

      querystring = querystring ? `?${querystring}` : '';

      return {
        url: origin + url + querystring,
        auth: entry.auth && authHeader(entry.auth, localConfig),
      };
    };
  });

  return (payload: RequestPayload): false | TestResult => {
    let res: false | TestResult = false;
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
    return res;
  };
};
