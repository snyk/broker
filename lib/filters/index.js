const pathRegexp = require('path-to-regexp');
const undefsafe = require('undefsafe');
const replace = require('../replace-vars');
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
    } catch (e) {
      console.warn(`Unable to parse ${ruleSource}, ignoring for now: ${e.message}`);
    }
  }


  if (!Array.isArray(rules)) {
    throw new Error(`unsupported type (${typeof rules}) for filter rules`);
  }

  logger.info('loading %s new rules', rules.length);

  // array of entries with
  const tests = rules.map(entry => {
    const keys = [];
    let { method, origin, path, valid, validParams } = entry;
    method = (method || 'get').toLowerCase();

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

    logger.info({ method, path }, 'new filter');
    const regexp = pathRegexp(path, keys);

    return (req) => {
      // check the request method
      if (req.method.toLowerCase() !== method && method !== 'any') {
        return false;
      }

      let [url, querystring] = req.url.split('?');
      const res = regexp.exec(url);
      if (!res) {
        // debug('bad regexp match', path, req.url, regexp.source);
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

      if (validParams && querystring) {
        const isValidParams = querystring.split('&').every(pair => {
          const [key, val] = pair.split('=');
          if (!validParams[key]) {
            return true;
          }

          return validParams[key].some(validValue => val.endsWith(validValue));
        });
        if (!isValidParams) {
          return false;
        }
      }

      if (valid && req.body) {
        const parsedBody = tryJSONParse(req.body);

        // validate against the body
        const isValid = valid.some(({ path, value }) => {
          return undefsafe(parsedBody, path, value);
        });

        if (!isValid) {
          return false;
        }
      }

      logger.debug({ path, origin, url }, 'match');

      // GITLAB support
      // request comes in with dummy token, replace with config
      if (config.GITLAB_TOKEN && querystring) {
        querystring = querystring.replace(
          `private_token=dummy_token`,
          `private_token=${config.GITLAB_TOKEN}`);
      };

      querystring = (querystring) ? `?${querystring}` : '';
      return origin + url + querystring;
    };
  });

  return (url, callback) => {
    let res = false;
    // unescape url
    url.url = decodeURIComponent(url.url);
    logger.debug(`testing ${tests.length} rules`);
    for (const test of tests) {
      res = test(url);
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
