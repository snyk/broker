import { setConfigKey } from '../config/config';

export const replace = (
  input: string | undefined,
  source: Record<string, unknown>,
) => {
  return (input || '').replace(/(\${.*?})/g, (_, match) => {
    const key = match.slice(2, -1); // ditch the wrappers
    let poolName: string | undefined;
    let poolIndex: string | undefined;
    if (source[key + '_POOL']) {
      poolName = key + '_POOL';
      poolIndex = key + '_POOL_IDX';
    } else if (source[key + 'Pool']) {
      poolName = key + 'Pool';
      poolIndex = key + 'PoolIdx';
    }

    const pool =
      // @ts-expect-error - source[poolName] is undefined
      source[poolName] && source[poolName].includes(',')
        ? // @ts-expect-error - source[poolName] is undefined
          source[poolName].split(',')
        : // @ts-expect-error - source[poolName] is undefined
          source[poolName];

    // const pool = source[poolName];
    let idx;
    if (pool) {
      // @ts-expect-error - source[poolName] is undefined
      idx = source[poolIndex] || 0;
      if (idx >= pool.length) {
        idx = 0;
      }
      // source[poolIndex] = idx + 1;
      // @ts-expect-error - source[poolIndex] is undefined
      setConfigKey(poolIndex, idx + 1);
    }

    return pool ? pool[idx] : source[key] || '';
  });
};

export const replaceUrlPartialChunk = (
  chunk: string,
  prevPartial: string | null,
  config: { BROKER_TOKEN: string; RES_BODY_URL_SUB: string },
) => {
  // 1/ make sure no protocol is present
  const protocolFreeURI = config.RES_BODY_URL_SUB.replace(/(^\w+:|^)\/\//, '');

  // 2/ create a regex to match all feasible protocols
  const replaceRegExp = new RegExp(`(\\w+:)//${protocolFreeURI}`, 'g');

  // 3/ create replacement string
  const replaceWith = `http://internal-broker-server-next/broker/${config.BROKER_TOKEN}`;

  if (prevPartial) {
    chunk = prevPartial + chunk;
  }

  // 4/ replace
  chunk = chunk.replace(replaceRegExp, replaceWith);

  const lastStringInChunk = chunk.split('"').pop();
  let partial;
  if (config.RES_BODY_URL_SUB.includes(lastStringInChunk!)) {
    chunk = chunk.substring(0, chunk.length - lastStringInChunk!.length);
    partial = lastStringInChunk;
  }
  return {
    newChunk: chunk,
    partial,
  };
};
