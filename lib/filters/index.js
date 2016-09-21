const pathRegexp = require('path-to-regexp');
const undefsafe = require('undefsafe');
const replace = require('../replace-vars');
const tryJSONParse = require('../try-json-parse');

// reads config that defines
module.exports = ruleSource => {
  const debug = require('debug')('broker:' + (process.env.BROKER_TYPE || 'filter'));

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

  debug('loading %s new rules', rules.length);

  // array of entries with
  const tests = rules.map(entry => {
    const keys = [];
    let { method, origin, path, valid } = entry;

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

    debug('new filter: %s %s', method, path);
    const regexp = pathRegexp(path, keys);

    return (req) => {
      // check the request method
      if (req.method.toLowerCase() !== method && method !== 'any') {
        return false;
      }

      let url = req.url.split('?').shift(); // strip the querystring
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

      debug('match %s -> %s', path, origin + url);

      return origin + url;
    };
  });

  return (url, callback) => {
    let res = false;
    debug(`testing ${tests.length} rules`);
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
