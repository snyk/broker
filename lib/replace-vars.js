module.exports = (string, source) => {
  return (string || '').replace(/(\${.*?})/g, (_, match) => {
    const key = match.slice(2, -1); // ditch the wrappers
    return source[key] || '';
  });
};
