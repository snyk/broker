module.exports = {
  replace,
  replaceUrlPartialChunk,
};

function replace(input, source) {
  return (input || '').replace(/(\${.*?})/g, (_, match) => {
    const key = match.slice(2, -1); // ditch the wrappers
    return source[key] || '';
  });
}

function replaceUrlPartialChunk(chunk, prevPartial, config) {
  const replaceRegExp = new RegExp(config.RES_BODY_URL_SUB, 'g');
  const replaceWith = `${config.BROKER_SERVER_URL}/broker/${config.BROKER_TOKEN}`;

  if (prevPartial) {
    chunk = prevPartial + chunk;
  }

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
