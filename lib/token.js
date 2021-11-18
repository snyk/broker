module.exports = {
  maskToken,
};

function maskToken(token) {
  if (!token || token === '') {
    return '';
  }

  return token.slice(0, 4) + '-...-' + token.slice(-4);
}
