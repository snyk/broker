import { handleStreamAbort } from '../../../../../../lib/hybrid-sdk/server/socketHandlers/identifyHandler';
import * as streamHandlerModule from '../../../../../../lib/hybrid-sdk/http/server-post-stream-handler';

describe('handleStreamAbort', () => {
  afterEach(() => jest.restoreAllMocks());

  it('destroys the stream for the given streamingID', () => {
    const destroy = jest.fn();
    jest
      .spyOn(streamHandlerModule.StreamResponseHandler, 'create')
      .mockReturnValue({ destroy } as any);

    handleStreamAbort('stream-1', 'edge 503');

    expect(destroy).toHaveBeenCalledWith(expect.any(Error));
    expect(destroy.mock.calls[0][0].message).toContain('edge 503');
  });

  it('is a no-op when the streamingID is unknown', () => {
    jest
      .spyOn(streamHandlerModule.StreamResponseHandler, 'create')
      .mockReturnValue(null);
    expect(() => handleStreamAbort('missing', 'reason')).not.toThrow();
  });
});
