const minimatch = require('minimatch');
const pathRegexp = require('path-to-regexp');
const qs = require('qs');
const undefsafe = require('undefsafe');
const replace = require('../replace-vars');
const authHeader = require('../auth-header');
const tryJSONParse = require('../try-json-parse');
const logger = require('../log');

// reads config that defines
module.exports = ruleSource => {
  let rules = [];
  const config = require('../config');

  // polymorphic support
  if (Array.isArray(ruleSource)) {
    rules = ruleSource;
  } else if (ruleSource) {
    try {
      rules = require(ruleSource);
    } catch (error) {
      logger.warn({ ruleSource, error }, 'Unable to parse rule source, ignoring');
    }
  }

  if (!Array.isArray(rules)) {
    throw new Error(`Expected array of filter rules, got '${typeof rules}' instead.`);
  }

  logger.info({ rulesCount: rules.length }, 'loading new rules');

  // array of entries with
  const tests = rules.map(entry => {
    const keys = [];
    let { method, origin, path, valid, stream } = entry;
    method = (method || 'get').toLowerCase();
    valid = valid || [];

    const bodyFilters = valid.filter(v => !!v.path && !v.regex);
    const bodyRegexFilters = valid.filter(v => !!v.path && !!v.regex);
    const queryFilters = valid.filter(v => !!v.queryParam);

    // now track if there's any values that we need to interpolate later
    const fromConfig = {};

    // slightly bespoke version of replace-vars.js
    path = (path || '').replace(/(\${.*?})/g, (_, match) => {
      const key = match.slice(2, -1); // ditch the wrappers
      fromConfig[key] = config[key] || '';
      return ':' + key;
    });

    origin = replace(origin, config);

    if (path[0] !== '/') {
      path = '/' + path;
    }

    logger.info({ method, path }, 'adding new filter rule');
    const regexp = pathRegexp(path, keys);

    return (req) => {
      // check the request method
      if (req.method.toLowerCase() !== method && method !== 'any') {
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
      if (bodyFilters.length || bodyRegexFilters.length ||
          queryFilters.length) {
        let isValid;

        let parsedBody;
        if (bodyFilters.length) {
          parsedBody = tryJSONParse(req.body);

          // validate against the body
          isValid = bodyFilters.some(({ path, value }) => {
            return undefsafe(parsedBody, path, value);
          });
        }

        if (!isValid && bodyRegexFilters.length) {
          parsedBody = parsedBody || tryJSONParse(req.body);

          // validate against the body by regex
          isValid = bodyRegexFilters.some(({ path, regex }) => {
            try {
              const re = new RegExp(regex);
              return re.test(undefsafe(parsedBody, path));
            } catch (error) {
              logger.error({error, path, regex},
                'failed to test regex rule');
              return false;
            }
          });
        }

        // no need to check query filters if the request is already valid
        if (!isValid && queryFilters.length) {
          const parsedQuerystring = qs.parse(querystring);

          // validate against the querystring
          isValid = queryFilters.some(({ queryParam, values }) => {
            return values.some(value =>
              minimatch(parsedQuerystring[queryParam] || '', value)
            );
          });
        }

        if (!isValid) {
          return false;
        }
      }

      logger.debug({ path, origin, url, querystring }, 'rule matched');

      querystring = (querystring) ? `?${querystring}` : '';
      return {
        url: origin + url + querystring,
        auth: entry.auth && authHeader(entry.auth),
        stream
      };
    };
  });

  return (payload, callback) => {
    let res = false;
    logger.debug({ rulesCount: tests.length }, 'looking for a rule match');

    for (const test of tests) {
      res = test(payload);
      if (res) {
        break;
      }
    }
    if (!res) {
      return callback(Error('blocked'));
    }

    return callback(null, res);
  };
};
