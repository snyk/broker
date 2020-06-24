module.exports = (input, source) => {
  return (input || '').replace(/(\${.*?})/g, (_, match) => {
    const key = match.slice(2, -1); // ditch the wrappers
    return source[key] || '';
  });
};
