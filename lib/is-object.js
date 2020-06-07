
// null is also considered as an object, so we assert truth
module.exports = (v)=> typeof v === 'object' && !!v;
