import minimatch from 'minimatch';
import pathRegexp from 'path-to-regexp';
import qs from 'qs';
import path from 'path';
import undefsafe from 'undefsafe';
import tryJSONParse from '../utils/try-json-parse';
import { log as logger } from '../../../logs/logger';

// Regex cache to prevent dynamic compilation on each request
const regexCache = new Map<string, RegExp>();

// Object pools for memory management
const queryObjectPool: Record<string, any>[] = [];

const getQueryObjectFromPool = (): Record<string, any> => {
  const obj = queryObjectPool.pop();
  if (obj) {
    // Clear all properties
    Object.keys(obj).forEach(key => delete obj[key]);
    return obj;
  }
  return {};
};

const returnQueryObjectToPool = (obj: Record<string, any>): void => {
  if (queryObjectPool.length < 50) { // Limit pool size
    queryObjectPool.push(obj);
  }
};

// Get cached regex or compile and cache new one
const getCachedRegex = (pattern: string): RegExp => {
  let regex = regexCache.get(pattern);
  if (!regex) {
    try {
      regex = new RegExp(pattern);
      regexCache.set(pattern, regex);
    } catch (error) {
      logger.error({ error, pattern }, 'Failed to compile regex pattern');
      // Return a regex that never matches for safety
      regex = /(?!)/;
      regexCache.set(pattern, regex);
    }
  }
  return regex;
};
import { RequestPayload } from '../types/http';
import {
  LOADEDFILTERSET,
  LOADEDFILTER,
  FILTER,
  FiltersType,
  Rule,
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
        `Loading ruleset (private + public rules) for ${filtersKeys[i]}.`,
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
        } public rules.`,
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
      path: entryPath,
      valid, // eslint-disable-line prefer-const
    } = entry;
    method = (method || 'get').toLowerCase();

    const bodyFilters = valid ? valid.filter((v) => !!v.path && !v.regex) : [];
    const bodyRegexFilters = valid
      ? valid.filter((v) => !!v.path && !!v.regex)
      : [];

    // Pre-compile and cache regexes during filter loading
    const compiledBodyRegexFilters = bodyRegexFilters.map(filter => ({
      ...filter,
      compiledRegex: filter.regex ? getCachedRegex(filter.regex) : null
    }));
    const queryFilters = valid ? valid.filter((v) => !!v.queryParam) : [];
    const headerFilters = valid ? valid.filter((v) => !!v.header) : [];

    // now track if there's any values that we need to interpolate later

    // load config from config.default.json based on type and config.universal.json based on token
    let localConfig =
      type && configFromApp?.universalBrokerEnabled
        ? Object.assign({}, getConfigForType(type), configFromApp)
        : configFromApp;

    if (!entryPath) {
      entryPath = '';
    }
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
      const hashIndex = req.url.indexOf('#');
      const mainURI = hashIndex !== -1 ? req.url.substring(0, hashIndex) : req.url;

      // query params might contain additional "?"s, only split on the 1st one
      const questionIndex = mainURI.indexOf('?');
      let url: string;
      let querystring: string;
      
      if (questionIndex !== -1) {
        url = mainURI.substring(0, questionIndex);
        querystring = mainURI.substring(questionIndex + 1);
      } else {
        url = mainURI;
        querystring = '';
      }
      const res = regexp.exec(url);
      if (!res) {
        // no url match
        return false;
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
            return undefsafe(parsedBody, filterPath!, value);
          });
        }

        if (!isValid && compiledBodyRegexFilters.length) {
          parsedBody = parsedBody || tryJSONParse(req.body);

          // validate against the body by regex using pre-compiled regexes
          isValid = compiledBodyRegexFilters.some(({ path: filterPath, compiledRegex }) => {
            if (!compiledRegex) return false;
            try {
              return compiledRegex.test(undefsafe(parsedBody, filterPath!));
            } catch (error) {
              logger.error(
                { error, path: filterPath },
                'failed to test regex rule',
              );
              return false;
            }
          });
        }

        // no need to check query filters if the request is already valid
        if (!isValid && queryFilters.length && querystring) {
          const parsedQuerystring = getQueryObjectFromPool();
          
          try {
            // Parse querystring into pooled object
            Object.assign(parsedQuerystring, qs.parse(querystring));

            // validate against the querystring
            isValid = queryFilters.every(({ queryParam, values }) => {
              // ! because the value is not undefined, queryFilters length to be non zero and array filtered earlier
              return values!.some((value) =>
                // ! because the queryParam is not undefined, queryFilters length to be non zero and array filtered earlier
                minimatch(
                  (parsedQuerystring[queryParam!] as string) || '',
                  value,
                  {
                    dot: true,
                  },
                ),
              );
            });
          } finally {
            // Always return object to pool
            returnQueryObjectToPool(parsedQuerystring);
          }
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
      const entryToReturn = { ...entry, connectionType: type };
      return entryToReturn as Rule;
    };
  });

  return (payload: RequestPayload): false | Rule => {
    let res: false | Rule = false;
    logger.debug({ rulesCount: tests.length }, 'looking for a rule match');

    try {
      for (const test of tests) {
        res = test(payload);
        if (res) {
          break;
        }
      }
    } catch (e: unknown) {
      logger.warn({ error: e }, 'Caught error checking request against rules.');
      res = false;
    }
    return res;
  };
};
