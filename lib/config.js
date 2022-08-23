const fs = require('fs');
const path = require('path');
const camelcase = require('camelcase');

const {loadConfig} = require('snyk-config');
const config = loadConfig(__dirname + '/..');

function camelify(res) {
  return Object.keys(res).reduce((acc, _) => {
    acc[camelcase(_)] = res[_];
    acc[_] = res[_];
    return acc;
  }, {});
}

function expandValue(obj, value) {
  let arrayFound = undefined;
  let keyWithArray = undefined;
  const variableRegex = /(\\?\$.+?\b)/g;
  const variableMatcher = value.match(variableRegex);
  if (variableMatcher) {
    for (const key of variableMatcher) {
      if (key[0] === "$" && obj[(key.slice(1) + "_ARRAY")]) {
        keyWithArray = key.slice(1);
        arrayFound = (key.slice(1) + "_ARRAY");
        break;
      }
    }
  }

  if (arrayFound) {
    const values = [];
    let array;
    if (Array.isArray(obj[arrayFound])) {
      array = obj[arrayFound];
    } else {
      array = obj[arrayFound].split(",").map(s => s.trim());
      obj[arrayFound] = array;
    }

    for (const o of array) {
      values.push(value.replace(variableRegex, (all, key) => {
        if (key[0] === '$') {
          const keyToReplace = key.slice(1);
          return keyToReplace === keyWithArray ? o : (obj[keyToReplace] || key);
        }

        return key;
      }));
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
    const value = expandValue(obj, obj[key]);
    if (value && Array.isArray(value)) {
      // This will get camel-cased later on
      obj[(key + "_ARRAY")] = value;
    } else if (value !== obj[key]) {
      obj[key] = value;
    }
  }

  return obj;
}

// allow the user to define their own configuration
const dotenv = require('dotenv');

dotenv.config({
  silent: true,
  path: process.cwd() + '/.env',
});

expand(process.env);

const res = Object.assign({}, camelify(config), camelify(process.env));

if (res.caCert) {
  res.caCert = fs.readFileSync(path.resolve(process.cwd(), res.caCert));
}

for (const [key, value] of Object.entries(res)) {
  if ((key.endsWith("Array") || key.endsWith("_ARRAY")) && !Array.isArray(value)) {
    res[key] = value.split(",").map(s => s.trim());
  }
}

module.exports = res;
