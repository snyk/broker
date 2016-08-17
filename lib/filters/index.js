const config = require('../config');
const pathRegexp = require('path-to-regexp');

// reads config that defines
module.exports = function (rules) {
  if (!rules) {
    rules = [];
  }

  if (!Array.isArray(rules)) {
    throw new Error(`unsupported type (${typeof rules}) for filter rules`);
  }

  // expects rules to be string of lines: `GET <url>\nPOST <url>\nDEL …`
  const tests = rules.map(line => {
    const keys = [];
    let [method, path] = line.split(' ', 2).map(_ => _.trim());

    method = method.toLowerCase();

    // now track if there's any values that we need to interpolate later
    const fromConfig = {};
    path = path.replace(/(\${.*?})/g, (_, match) => {
      const key = match.slice(2, -1); // ditch the wrappers
      fromConfig[key] = config[key] || '';
      return ':' + key;
    });

    if (path[0] !== '/') {
      path = '/' + path;
    }

    const regexp = pathRegexp(path, keys);

    return (req) => {
      // check the request method
      if (req.method.toLowerCase() !== method && method !== 'any') {
        return false;
      }

      let url = req.url;
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

      return url;
    };
  });

  return (url, callback) => {
    var res = tests.map(_ => _(url)).filter(Boolean);
    if (res.length === 0) {
      return callback(Error('blocked'));
    }

    return callback(null, 'https:/' + res[0]);
  };
};
