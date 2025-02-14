import { contentTypeHeader, urlencoded } from './headers-value-constants';

export const computeContentLength = (payload): number => {
  let contentLength = 0;
  if (!payload.body || payload.body.length === 0) {
    contentLength = 0;
  } else if (payload.headers[contentTypeHeader] === urlencoded) {
    const encoder = new TextEncoder();
    const byteArray = encoder.encode(payload.body);
    contentLength = byteArray.length;
  } else {
    contentLength = Buffer.byteLength(payload.body, 'utf8');
  }
  return contentLength;
};
