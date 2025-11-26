export default <T extends ArrayBufferLike>(data: T) => {
  try {
    return JSON.parse(Buffer.from(data).toString()) || {};
  } catch (e) {
    return {};
  }
};
