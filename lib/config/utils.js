const camelcase = require('camelcase');

module.exports = {
  camelify,
  expand,
};

function camelify(res) {
  return Object.keys(res).reduce((acc, _) => {
    acc[camelcase(_)] = res[_];
    acc[_] = res[_];
    return acc;
  }, {});
}

function expandValue(obj, value) {
  return value.replace(/([\\]?\$.+?\b)/g, (all, key) => {
    if (key[0] === '$') {
      key = key.slice(1);
      return obj[key] || '';
    }

    return key;
  });
}

function expand(obj) {
  const keys = Object.keys(obj);

  for (const key of keys) {
    const value = expandValue(obj, obj[key]);
    if (value !== obj[key]) {
      obj[key] = value;
    }
  }

  return obj;
}
