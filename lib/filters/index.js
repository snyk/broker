const pathRegexp = require('path-to-regexp');
const debug = require('debug')('broker');
const undefsafe = require('undefsafe');

// reads config that defines
module.exports = function (filename) {
  let rules = [];
  const config = require('../config');

  if (filename) {
    try {
      rules = require(filename);
    } catch (e) {
      console.warn(`Unable to parse ${filename}, ignoring for now: ${e.message}`);
    }
  }

  if (!Array.isArray(rules)) {
    throw new Error(`unsupported type (${typeof rules}) for filter rules`);
  }

  // array of entries with
  const tests = rules.map(entry => {
    const keys = [];
    let { method, origin, path, valid } = entry;

    method = (method || 'get').toLowerCase();

    // now track if there's any values that we need to interpolate later
    const fromConfig = {};
    path = path.replace(/(\${.*?})/g, (_, match) => {
      const key = match.slice(2, -1); // ditch the wrappers
      fromConfig[key] = config[key] || '';
      return ':' + key;
    });

    origin = (origin || '').replace(/(\${.*?})/g, (_, match) => {
      const key = match.slice(2, -1); // ditch the wrappers
      return config[key] || '';
    });

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
        // console.log('false', path, req.url, regexp.source);
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
        // validate against the body
        const isValid = valid.some(({ path, value }) => {
          return undefsafe(req.body, path, value);
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
