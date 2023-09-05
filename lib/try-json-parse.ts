export default (data) => {
  try {
    return JSON.parse(Buffer.from(data).toString()) || {};
  } catch (e) {
    return {};
  }
};
