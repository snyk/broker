import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  ResponseFrameDecoder,
  ResponseFrameError,
} from '../../../../../lib/hybrid-sdk/http/response-frame-decoder';

const createFrame = (
  body = Buffer.from('response body'),
  metadata: Record<string, unknown> = {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  },
) => {
  const encodedMetadata = Buffer.from(JSON.stringify(metadata), 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(encodedMetadata.length);
  return { prefix, metadata: encodedMetadata, body };
};

const decode = async (chunks: Buffer[]) => {
  const body: Buffer[] = [];
  const metadata = jest.fn();
  const decoder = new ResponseFrameDecoder({ onMetadata: metadata });
  await pipeline(
    Readable.from(chunks),
    decoder,
    new Writable({
      write(chunk, _encoding, callback) {
        body.push(chunk);
        callback();
      },
    }),
  );
  return { body: Buffer.concat(body), metadata, decoder };
};

const decodeFailure = async (
  decoding: Promise<unknown>,
): Promise<ResponseFrameError> => {
  try {
    await decoding;
    throw new Error('Expected response frame decoding to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(ResponseFrameError);
    return error as ResponseFrameError;
  }
};

describe('hybrid-sdk/http', () => {
  describe('ResponseFrameDecoder', () => {
    it.each([
      ['1+3', [1, 3]],
      ['2+2', [2, 2]],
      ['3+1', [3, 1]],
      ['1+1+1+1', [1, 1, 1, 1]],
    ])(
      'decodes the frame when the prefix arrives as %s',
      async (_label, sizes) => {
        const framed = createFrame();
        let offset = 0;
        const chunks = sizes.map((size) => {
          const chunk = framed.prefix.subarray(offset, offset + size);
          offset += size;
          return chunk;
        });
        chunks.push(framed.metadata, framed.body);

        const result = await decode(chunks);

        expect(result.metadata).toHaveBeenCalledWith({
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
        expect(result.body).toEqual(framed.body);
      },
    );

    it('decodes metadata when a UTF-8 code point is split across chunks', async () => {
      const framed = createFrame(Buffer.from('body'), {
        status: 206,
        headers: { 'x-label': '日本語' },
      });
      const split = framed.metadata.indexOf(Buffer.from('日')) + 1;

      const result = await decode([
        Buffer.concat([framed.prefix, framed.metadata.subarray(0, split)]),
        framed.metadata.subarray(split),
        framed.body,
      ]);

      expect(result.metadata).toHaveBeenCalledWith({
        status: 206,
        headers: { 'x-label': '日本語' },
      });
      expect(result.body).toEqual(framed.body);
    });

    it('forwards body bytes from the chunk that completes metadata', async () => {
      const framed = createFrame();
      const split = framed.metadata.length - 3;
      const firstBodyBytes = framed.body.subarray(0, 5);

      const result = await decode([
        Buffer.concat([framed.prefix, framed.metadata.subarray(0, split)]),
        Buffer.concat([framed.metadata.subarray(split), firstBodyBytes]),
        framed.body.subarray(5),
      ]);

      expect(result.body).toEqual(framed.body);
    });

    it('does not forward body bytes when metadata application fails', async () => {
      const framed = createFrame(Buffer.from('must-not-be-written'));
      const destination = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      });
      const write = jest.spyOn(destination, 'write');
      const metadataError = new Error('original response rejected metadata');

      await expect(
        pipeline(
          Readable.from([
            Buffer.concat([framed.prefix, framed.metadata, framed.body]),
          ]),
          new ResponseFrameDecoder({
            onMetadata: () => {
              throw metadataError;
            },
          }),
          destination,
        ),
      ).rejects.toThrow(metadataError.message);

      expect(write).not.toHaveBeenCalled();
    });

    it('forwards body bytes before the source ends', async () => {
      const framed = createFrame();
      const source = new Readable({ read() {} });
      const received: Buffer[] = [];
      let firstWrite!: () => void;
      const firstWriteSeen = new Promise<void>(
        (resolve) => (firstWrite = resolve),
      );
      const running = pipeline(
        source,
        new ResponseFrameDecoder(),
        new Writable({
          write(chunk, _encoding, callback) {
            received.push(chunk);
            firstWrite();
            callback();
          },
        }),
      );

      source.push(Buffer.concat([framed.prefix, framed.metadata, framed.body]));
      await firstWriteSeen;
      expect(Buffer.concat(received)).toEqual(framed.body);
      expect(source.readableEnded).toBe(false);

      source.push(null);
      await running;
    });

    it('propagates destination backpressure to the source', async () => {
      const framed = createFrame(Buffer.alloc(0));
      const bodyChunk = Buffer.alloc(64 * 1024);
      const totalBodyChunks = 100;
      let emittedBodyChunks = 0;
      let releaseFirstWrite!: () => void;
      const firstWriteBlocked = new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });
      let firstWrite = true;
      const source = new Readable({
        read() {
          if (emittedBodyChunks === 0) {
            this.push(Buffer.concat([framed.prefix, framed.metadata]));
          }
          while (emittedBodyChunks < totalBodyChunks) {
            emittedBodyChunks += 1;
            if (!this.push(bodyChunk)) {
              return;
            }
          }
          this.push(null);
        },
      });
      const destination = new Writable({
        highWaterMark: 1,
        write(_chunk, _encoding, callback) {
          if (firstWrite) {
            firstWrite = false;
            firstWriteBlocked.then(() => callback());
          } else {
            callback();
          }
        },
      });

      const running = pipeline(source, new ResponseFrameDecoder(), destination);
      await new Promise((resolve) => setImmediate(resolve));
      expect(emittedBodyChunks).toBeLessThan(totalBodyChunks);

      releaseFirstWrite();
      await running;
      expect(emittedBodyChunks).toBe(totalBodyChunks);
    });

    it.each([1, 2, 3])(
      'rejects the frame when the prefix ends after %d byte(s)',
      async (length) => {
        const { prefix } = createFrame();
        const error = await decodeFailure(decode([prefix.subarray(0, length)]));

        expect(error).toMatchObject({
          message: `Incomplete metadata-length prefix: received ${length} of 4 bytes.`,
          diagnostics: {
            failureReason: 'incomplete-prefix',
            receivedPrefixBytes: length,
            expectedPrefixBytes: 4,
          },
        });
      },
    );

    it('rejects the frame when metadata is truncated', async () => {
      const { prefix, metadata } = createFrame();
      const error = await decodeFailure(
        decode([prefix, metadata.subarray(0, metadata.length - 2)]),
      );

      expect(error).toMatchObject({
        message: `Incomplete response metadata: received ${
          metadata.length - 2
        } of ${metadata.length} bytes.`,
        diagnostics: {
          failureReason: 'incomplete-metadata',
          receivedMetadataBytes: metadata.length - 2,
          expectedMetadataBytes: metadata.length,
        },
      });
    });

    it('rejects the frame when metadata contains malformed JSON', async () => {
      const malformed = Buffer.from('{not json');
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32LE(malformed.length);
      const error = await decodeFailure(decode([prefix, malformed]));

      expect(error).toMatchObject({
        message: 'Malformed response metadata JSON.',
        diagnostics: { failureReason: 'malformed-metadata' },
      });
    });

    it('accepts metadata when headers are omitted', async () => {
      const framed = createFrame(Buffer.from('blocked'), { status: 401 });

      const result = await decode([
        Buffer.concat([framed.prefix, framed.metadata, framed.body]),
      ]);

      expect(result.metadata).toHaveBeenCalledWith({ status: 401 });
      expect(result.body).toEqual(framed.body);
    });

    it('rejects metadata when the HTTP status is invalid', async () => {
      const framed = createFrame(Buffer.alloc(0), { headers: {} });
      const error = await decodeFailure(
        decode([Buffer.concat([framed.prefix, framed.metadata])]),
      );

      expect(error).toMatchObject({
        message: 'Response metadata must contain a valid status.',
        diagnostics: { failureReason: 'invalid-metadata' },
      });
    });

    it('rejects metadata before buffering when its declared length exceeds the limit', async () => {
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32LE(11);
      const decoder = new ResponseFrameDecoder({ maxMetadataBytes: 10 });
      const error = await decodeFailure(
        pipeline(
          Readable.from([prefix]),
          decoder,
          new Writable({ write() {} }),
        ),
      );

      expect(error).toMatchObject({
        message: expect.stringContaining('exceeds the 10-byte limit'),
        diagnostics: { failureReason: 'metadata-too-large' },
      });
    });
  });
});
