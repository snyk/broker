export const isJson = (responseHeaders) => {
  return responseHeaders['content-type']
    ? responseHeaders['content-type'].includes('json')
    : false;
};
