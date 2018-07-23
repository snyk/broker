module.exports = (data) => {
  try {
    return JSON.parse(Buffer.from(data)) || {};
  } catch (e) {
    return {};
  }
}
