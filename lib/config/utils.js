const camelcase = require('camelcase');

module.exports = {
  camelify,
};

function camelify(res) {
  return Object.keys(res).reduce((acc, _) => {
    acc[camelcase(_)] = res[_];
    acc[_] = res[_];
    return acc;
  }, {});
}
