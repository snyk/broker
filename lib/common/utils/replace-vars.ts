export const replace = (input, source) => {
  return (input || '').replace(/(\${.*?})/g, (_, match) => {
    const key = match.slice(2, -1); // ditch the wrappers
    let poolName;
    let poolIndex;
    if (source[key + '_POOL']) {
      poolName = key + '_POOL';
      poolIndex = key + '_POOL_IDX';
    } else if (source[key + 'Pool']) {
      poolName = key + 'Pool';
      poolIndex = key + 'PoolIdx';
    }

    const pool =
      source[poolName] && source[poolName].includes(',')
        ? source[poolName].split(',')
        : source[poolName];

    // const pool = source[poolName];
    let idx;
    if (pool) {
      idx = source[poolIndex] || 0;
      if (idx >= pool.length) {
        idx = 0;
      }
      source[poolIndex] = idx + 1;
    }

    return pool ? pool[idx] : source[key] || '';
  });
};

export const replaceUrlPartialChunk = (chunk, prevPartial, config) => {
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
};
