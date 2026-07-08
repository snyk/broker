import { emitResponseDataAbort } from '../../../../../lib/hybrid-sdk/http/response-data-abort';

describe('emitResponseDataAbort', () => {
  it('sends an abort over the websocket when enabled', () => {
    const send = jest.fn();
    emitResponseDataAbort({ send }, 'stream-1', 'HTTP 503', {
      brokerResponseDataFailfastEnabled: true,
    });
    expect(send).toHaveBeenCalledWith('abort', 'stream-1', 'HTTP 503');
  });

  it('is a no-op when disabled via flag', () => {
    const send = jest.fn();
    emitResponseDataAbort({ send }, 'stream-1', 'HTTP 503', {
      brokerResponseDataFailfastEnabled: 'false',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('is a no-op when no websocket handler is available', () => {
    expect(() =>
      emitResponseDataAbort(undefined, 'stream-1', 'HTTP 503', {
        brokerResponseDataFailfastEnabled: true,
      }),
    ).not.toThrow();
  });

  it('defaults to enabled when the flag is unset', () => {
    const send = jest.fn();
    emitResponseDataAbort({ send }, 'stream-1', 'reason', {});
    expect(send).toHaveBeenCalledWith('abort', 'stream-1', 'reason');
  });
});
