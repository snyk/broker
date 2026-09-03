import { Transform, TransformCallback } from 'stream';

export interface ResponseMetadata {
  status: number;
  headers?: Record<string, string | string[] | number | undefined>;
  errorType?: string;
}

export interface ResponseFrameDecoderOptions {
  maxMetadataBytes?: number;
  onMetadata?: (metadata: ResponseMetadata) => void;
}

const PREFIX_BYTES = 4;
// Defensive implementation bound only. Choosing a protocol-level limit needs
// a separate compatibility decision across deployed Broker versions.
// TODO: replace this with an explicitly versioned protocol limit.
const DEFAULT_MAX_METADATA_BYTES = 1024 * 1024;

/**
 * Decodes one Broker POST response frame:
 *
 *   4-byte little-endian metadata byte length | JSON metadata | body bytes
 *
 * Only body bytes are emitted from the readable side. Metadata is delivered
 * synchronously before the first body byte through the callback/event.
 */
export class ResponseFrameDecoder extends Transform {
  readonly maxMetadataBytes: number;
  bodyBytes = 0;

  private readonly prefix = Buffer.alloc(PREFIX_BYTES);
  private prefixBytes = 0;
  private metadataBytesExpected: number | null = null;
  private metadataBytes = 0;
  private readonly metadataChunks: Buffer[] = [];
  private metadataDecoded = false;
  private readonly onMetadata?: (metadata: ResponseMetadata) => void;

  constructor(options: ResponseFrameDecoderOptions = {}) {
    super();
    this.maxMetadataBytes =
      options.maxMetadataBytes ?? DEFAULT_MAX_METADATA_BYTES;
    this.onMetadata = options.onMetadata;
  }

  _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const data = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk, encoding);
      let offset = 0;

      if (this.metadataBytesExpected === null) {
        const prefixBytesToCopy = Math.min(
          PREFIX_BYTES - this.prefixBytes,
          data.length,
        );
        data.copy(
          this.prefix,
          this.prefixBytes,
          offset,
          offset + prefixBytesToCopy,
        );
        this.prefixBytes += prefixBytesToCopy;
        offset += prefixBytesToCopy;

        if (this.prefixBytes < PREFIX_BYTES) {
          callback();
          return;
        }

        this.metadataBytesExpected = this.prefix.readUInt32LE(0);
        if (this.metadataBytesExpected === 0) {
          throw new Error('Response metadata must not be empty.');
        }
        if (this.metadataBytesExpected > this.maxMetadataBytes) {
          throw new Error(
            `Response metadata length ${this.metadataBytesExpected} exceeds the ${this.maxMetadataBytes}-byte limit.`,
          );
        }
      }

      if (!this.metadataDecoded && offset < data.length) {
        const metadataBytesToCopy = Math.min(
          this.metadataBytesExpected - this.metadataBytes,
          data.length - offset,
        );
        if (metadataBytesToCopy > 0) {
          this.metadataChunks.push(
            data.subarray(offset, offset + metadataBytesToCopy),
          );
          this.metadataBytes += metadataBytesToCopy;
          offset += metadataBytesToCopy;
        }

        if (this.metadataBytes === this.metadataBytesExpected) {
          const metadata = this.decodeMetadata();
          this.metadataDecoded = true;
          this.onMetadata?.(metadata);
          this.emit('metadata', metadata);
        }
      }

      if (this.metadataDecoded && offset < data.length) {
        const body = data.subarray(offset);
        this.bodyBytes += body.length;
        this.push(body);
      }
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    if (this.prefixBytes < PREFIX_BYTES) {
      callback(
        new Error(
          `Incomplete metadata-length prefix: received ${this.prefixBytes} of ${PREFIX_BYTES} bytes.`,
        ),
      );
      return;
    }
    if (!this.metadataDecoded) {
      callback(
        new Error(
          `Incomplete response metadata: received ${this.metadataBytes} of ${this.metadataBytesExpected} bytes.`,
        ),
      );
      return;
    }
    callback();
  }

  private decodeMetadata(): ResponseMetadata {
    const encoded = Buffer.concat(
      this.metadataChunks,
      this.metadataBytesExpected!,
    ).toString('utf8');
    let value: unknown;
    try {
      value = JSON.parse(encoded);
    } catch (error) {
      throw new Error('Malformed response metadata JSON.', { cause: error });
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Response metadata must be a JSON object.');
    }
    const metadata = value as Partial<ResponseMetadata>;
    if (
      !Number.isInteger(metadata.status) ||
      metadata.status! < 100 ||
      metadata.status! > 999
    ) {
      throw new Error('Response metadata must contain a valid status.');
    }
    if (
      metadata.headers !== undefined &&
      (typeof metadata.headers !== 'object' ||
        metadata.headers === null ||
        Array.isArray(metadata.headers))
    ) {
      throw new Error('Response metadata headers must be an object.');
    }
    if (
      metadata.errorType !== undefined &&
      typeof metadata.errorType !== 'string'
    ) {
      throw new Error('Response metadata errorType must be a string.');
    }
    return metadata as ResponseMetadata;
  }
}
