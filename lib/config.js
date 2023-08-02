const fs = require('fs');
const path = require('path');
const camelcase = require('camelcase');

const { loadConfig } = require('snyk-config');
let config = loadConfig(process.cwd());

function camelify(res) {
  return Object.keys(res).reduce((acc, _) => {
    acc[camelcase(_)] = res[_];
    acc[_] = res[_];
    return acc;
  }, {});
}

function expandValue(obj, value) {
  let poolFound = undefined;
  let keyWithPool = undefined;
  if (typeof value == 'boolean') {
    return;
  }
  const variableRegex = /(\\?\$.+?\b)/g;
  const variableMatcher = value.match(variableRegex);
  if (variableMatcher) {
    for (const key of variableMatcher) {
      if (key[0] === '$' && obj[key.slice(1) + '_POOL']) {
        keyWithPool = key.slice(1);
        poolFound = key.slice(1) + '_POOL';
        break;
      }
    }
  }

  if (poolFound) {
    const values = [];
    let pool;
    if (Array.isArray(obj[poolFound])) {
      pool = obj[poolFound];
    } else {
      pool = obj[poolFound].split(',').map((s) => s.trim());
      obj[poolFound] = pool;
    }

    for (const o of pool) {
      values.push(
        value.replace(variableRegex, (all, key) => {
          if (key[0] === '$') {
            const keyToReplace = key.slice(1);
            return keyToReplace === keyWithPool ? o : obj[keyToReplace] || key;
          }

          return key;
        }),
      );
    }
    return values;
  } else {
    return value.replace(variableRegex, (all, key) => {
      if (key[0] === '$') {
        const keyToReplace = key.slice(1);
        return obj[keyToReplace] || key;
      }

      return key;
    });
  }
}

function expand(obj) {
  const keys = Object.keys(obj);

  for (const key of keys) {
    // Expand nested objects
    if (typeof obj[key] == 'object') {
      expand(obj[key]);
    } else {
      const value = expandValue(obj, obj[key]);
      if (value && Array.isArray(value)) {
        // This will get camel-cased later on
        obj[key + '_POOL'] = value;
      } else if (value !== obj[key]) {
        obj[key] = value;
      }
    }
  }

  return obj;
}

// allow the user to define their own configuration
if (config.BROKER_BOOT_MODE != 'universal') {
  // Classic broker
  const dotenv = require('dotenv');

  dotenv.config({
    silent: true,
    path: process.cwd() + '/.env',
  });
} else {
  expand(config);
}

expand(process.env);

const res = Object.assign({}, config, camelify(process.env));
if (res.caCert) {
  res.caCert = fs.readFileSync(path.resolve(process.cwd(), res.caCert));
}

for (const [key, value] of Object.entries(res)) {
  if (
    (key.endsWith('Pool') || key.endsWith('_POOL')) &&
    !Array.isArray(value)
  ) {
    res[key] = value.split(',').map((s) => s.trim());
  }
}

module.exports = res;
