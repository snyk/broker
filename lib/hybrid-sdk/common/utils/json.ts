export const isJson = (responseHeaders: Object) => {
  return responseHeaders['content-type']
    ? responseHeaders['content-type'].includes('json')
    : false;
};
