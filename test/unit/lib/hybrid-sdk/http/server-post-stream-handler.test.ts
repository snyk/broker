import stream from 'stream';
import {
  streamsStore,
  StreamResponseHandler,
} from '../../../../../lib/hybrid-sdk/http/server-post-stream-handler';

const makeFakeRes = () => ({
  status: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
});

describe('StreamResponseHandler deadline timer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    streamsStore.flushAll();
  });

  it('finished() clears the armed deadline timer', () => {
    const buf = new stream.PassThrough();
    const timer = setTimeout(() => buf.destroy(new Error('deadline')), 60_000);
    streamsStore.set('s1', {
      streamBuffer: buf,
      response: makeFakeRes(),
      streamSize: 0,
      brokerAppClientId: null,
      deadlineTimer: timer,
    });
    const handler = StreamResponseHandler.create('s1')!;
    handler.finished();
    // After finished(), advancing past the deadline must NOT destroy the buffer.
    jest.advanceTimersByTime(120_000);
    expect(buf.destroyed).toBe(false);
  });

  it('destroy() clears the armed deadline timer and destroys the buffer', () => {
    const buf = new stream.PassThrough();
    buf.on('error', () => {}); // suppress unhandled error from buf.destroy(error)
    const timer = setTimeout(() => buf.destroy(new Error('deadline')), 60_000);
    streamsStore.set('s2', {
      streamBuffer: buf,
      response: makeFakeRes(),
      streamSize: 0,
      brokerAppClientId: null,
      deadlineTimer: timer,
    });
    const handler = StreamResponseHandler.create('s2')!;
    handler.destroy(new Error('aborted'));
    expect(buf.destroyed).toBe(true);
    jest.advanceTimersByTime(120_000); // timer already cleared; no throw
  });
});
