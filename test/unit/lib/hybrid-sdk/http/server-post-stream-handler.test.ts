import { stripConnectionScopedHeaders } from '../../../../../lib/hybrid-sdk/http/server-post-stream-handler';

describe('stripConnectionScopedHeaders', () => {
  const downstreamHeaders = {
    'content-type': 'application/json',
    'content-length': '1024',
    'transfer-encoding': 'chunked',
    connection: 'keep-alive',
    'keep-alive': 'timeout=5',
    etag: 'abc123',
  };

  it('drops connection-scoped headers and keeps entity headers', () => {
    const headers = stripConnectionScopedHeaders(downstreamHeaders, 'GET');

    expect(headers).toEqual({
      'content-type': 'application/json',
      etag: 'abc123',
    });
  });

  it('does not mutate the headers it was given', () => {
    const original = { ...downstreamHeaders };

    stripConnectionScopedHeaders(downstreamHeaders, 'GET');

    expect(downstreamHeaders).toEqual(original);
  });

  it('keeps Content-Length on a HEAD response, which has no body', () => {
    const headers = stripConnectionScopedHeaders(downstreamHeaders, 'head');

    expect(headers['content-length']).toEqual('1024');
    expect(headers['transfer-encoding']).toBeUndefined();
  });

  it('matches header names case insensitively', () => {
    const headers = stripConnectionScopedHeaders(
      { 'Content-Length': '1024', 'Content-Type': 'application/json' },
      'GET',
    );

    expect(headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('tolerates a missing header object and an unknown method', () => {
    expect(stripConnectionScopedHeaders(undefined, undefined)).toEqual({});
  });
});
