module.exports = {
  replace,
  replaceUrlPartialChunk,
};

function replace(input, source) {
  return (input || '').replace(/(\${.*?})/g, (_, match) => {
      const key = match.slice(2, -1); // ditch the wrappers
      let keyName;
      let idxName;
      if (source[(key + "_ARRAY")]) {
          keyName = key + "_ARRAY";
          idxName = key + "_ARRAY_IDX";
      } else if (source[(key + "Array")]) {
          keyName = key + "Array";
          idxName = key + "ArrayIdx";
      }

      const array = source[keyName];
      let idx;
      if (array) {
          idx = source[idxName] || 0;
          if (idx >= array.length) {
              idx = 0;
          }
          source[idxName] = idx + 1;
      }

      return array ? array[idx] : source[key] || '';
  });
}

function replaceUrlPartialChunk(chunk, prevPartial, config) {
  // 1/ make sure no protocol is present
  const protocolFreeURI = config.RES_BODY_URL_SUB.replace(/(^\w+:|^)\/\//, '');

  // 2/ create a regex to match all feasible protocols
  const replaceRegExp = new RegExp(`(\\w+:)//${protocolFreeURI}`, 'g');

  // 3/ create replacement string
  const replaceWith = `http://internal-broker-server/broker/${config.BROKER_TOKEN}`;

  if (prevPartial) {
    chunk = prevPartial + chunk;
  }

  // 4/ replace
  chunk = chunk.replace(replaceRegExp, replaceWith);

  const lastStringInChunk = chunk.split('"').pop();
  let partial;
  if (config.RES_BODY_URL_SUB.includes(lastStringInChunk)) {
    chunk = chunk.substring(0, chunk.length - lastStringInChunk.length);
    partial = lastStringInChunk;
  }
  return {
    newChunk: chunk,
    partial,
  };
}
