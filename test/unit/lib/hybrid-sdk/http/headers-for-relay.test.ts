import { headersForRelay } from '../../../../../lib/hybrid-sdk/http/downstream-post-stream-to-server';

describe('headersForRelay', () => {
  const downstreamHeaders = {
    'content-type': 'application/json',
    'content-length': '1024',
    etag: 'abc123',
  };

  it('drops Content-Length when the body will be rewritten', () => {
    expect(headersForRelay(downstreamHeaders, true)).toEqual({
      'content-type': 'application/json',
      etag: 'abc123',
    });
  });

  it('leaves the headers untouched when the body is relayed as is', () => {
    expect(headersForRelay(downstreamHeaders, false)).toBe(downstreamHeaders);
  });

  it('does not mutate the headers it was given', () => {
    const original = { ...downstreamHeaders };

    headersForRelay(downstreamHeaders, true);

    expect(downstreamHeaders).toEqual(original);
  });

  it('matches the header name case insensitively', () => {
    expect(
      headersForRelay({ 'Content-Length': '1024', ETag: 'abc123' }, true),
    ).toEqual({ ETag: 'abc123' });
  });
});
