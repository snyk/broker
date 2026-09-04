import http from 'node:http';
import { AddressInfo } from 'node:net';
import { PassThrough, Writable } from 'node:stream';
import express, { Response } from 'express';
import { log } from '../../../../../../lib/logs/logger';
import { handlePostResponse } from '../../../../../../lib/hybrid-sdk/server/routesHandlers/postResponseHandler';
import { pendingResponseRegistry } from '../../../../../../lib/hybrid-sdk/http/server-post-stream-handler';
import { getConfig } from '../../../../../../lib/hybrid-sdk/common/config/config';

jest.mock('../../../../../../lib/logs/logger', () => ({
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../../../lib/hybrid-sdk/common/config/config', () => ({
  getConfig: jest.fn(() => ({ BROKER_SERVER_MANDATORY_AUTH_ENABLED: false })),
}));

jest.mock('../../../../../../lib/hybrid-sdk/server/utils/token', () => ({
  getDesensitizedToken: jest.fn(() => ({
    hashedToken: 'hashed',
    maskedToken: 'masked',
  })),
}));

const frame = (
  metadata: Record<string, unknown>,
  body = Buffer.alloc(0),
): Buffer => {
  const encodedMetadata = Buffer.from(JSON.stringify(metadata));
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(encodedMetadata.length);
  return Buffer.concat([prefix, encodedMetadata, body]);
};

const framedParts = () => {
  const metadata = Buffer.from(
    JSON.stringify({ status: 206, headers: { 'x-spike': 'pipeline' } }),
  );
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(metadata.length);
  return { prefix, metadata };
};

const createReqRes = () => {
  const req = new PassThrough() as any;
  req.params = { brokerToken: 'token', streamingId: 'stream-1' };
  req.headers = {};
  req.requestId = 'req-1';
  const res = {
    headersSent: false,
    destroyed: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
  return { req, res };
};

const claimedPending = (destination: Writable = new PassThrough()) => {
  destination.on('data', () => undefined);
  return {
    destination,
    applyMetadata: jest.fn(),
    complete: jest.fn(),
    cancel: jest.fn(),
  };
};

describe('hybrid-sdk/server', () => {
  describe('handlePostResponse()', () => {
    let claimSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();
      claimSpy = jest.spyOn(pendingResponseRegistry, 'claim');
      (getConfig as jest.Mock).mockReturnValue({
        BROKER_SERVER_MANDATORY_AUTH_ENABLED: false,
      });
    });

    afterEach(() => {
      claimSpy.mockRestore();
    });

    it('claims the pending response and acknowledges after delivery completes', async () => {
      const { req, res } = createReqRes();
      const received: Buffer[] = [];
      const destination = new PassThrough();
      destination.on('data', (chunk) => received.push(chunk));
      const pending = claimedPending(destination);
      claimSpy.mockReturnValue({
        status: 'claimed',
        pending,
      });

      const handling = handlePostResponse(req, res);
      req.write(
        frame(
          {
            status: 201,
            headers: { 'content-type': 'application/octet-stream' },
          },
          Buffer.from('first'),
        ),
      );
      req.end(Buffer.from('-second'));
      await handling;

      expect(pendingResponseRegistry.claim).toHaveBeenCalledWith('stream-1', {
        brokerAppClientId: undefined,
        enforceBrokerOwnership: false,
      });
      expect(pending.applyMetadata).toHaveBeenCalledWith({
        status: 201,
        headers: { 'content-type': 'application/octet-stream' },
      });
      expect(Buffer.concat(received).toString()).toBe('first-second');
      expect(pending.complete).toHaveBeenCalledWith(12);
      expect(pending.cancel).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({});
      expect(pending.complete.mock.invocationCallOrder[0]).toBeLessThan(
        res.status.mock.invocationCallOrder[0],
      );
      for (const logger of [log.debug, log.info, log.error]) {
        for (const [context] of (logger as jest.Mock).mock.calls) {
          expect(context).not.toHaveProperty('failureReason');
          expect(context).not.toHaveProperty('receivedPrefixBytes');
          expect(context).not.toHaveProperty('expectedPrefixBytes');
          expect(context).not.toHaveProperty('receivedMetadataBytes');
          expect(context).not.toHaveProperty('expectedMetadataBytes');
        }
      }
    });

    it('logs the error type at info level when the response status indicates an error', async () => {
      const { req, res } = createReqRes();
      const pending = claimedPending();
      claimSpy.mockReturnValue({
        status: 'claimed',
        pending,
      });

      const handling = handlePostResponse(req, res);
      req.end(
        frame({
          status: 502,
          headers: {},
          errorType: 'DOWNSTREAM_UNREACHABLE',
        }),
      );
      await handling;

      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          responseStatus: 502,
          errorType: 'DOWNSTREAM_UNREACHABLE',
        }),
        'Handling response-data request - io bits',
      );
    });

    it('waits for destination finalization before acknowledging', async () => {
      const { req, res } = createReqRes();
      let releaseFinal!: () => void;
      const destination = new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
        final(callback) {
          releaseFinal = callback;
        },
      });
      const pending = claimedPending(destination);
      claimSpy.mockReturnValue({
        status: 'claimed',
        pending,
      });

      const handling = handlePostResponse(req, res);
      req.end(frame({ status: 200 }, Buffer.from('body')));
      await new Promise((resolve) => setImmediate(resolve));

      expect(pending.complete).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();

      releaseFinal();
      await handling;
      expect(pending.complete).toHaveBeenCalledWith(4);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('cancels the claim and returns 500 when the source fails', async () => {
      const { req, res } = createReqRes();
      const pending = claimedPending();
      claimSpy.mockReturnValue({
        status: 'claimed',
        pending,
      });

      const handling = handlePostResponse(req, res);
      const sourceError = new Error('request aborted');
      req.destroy(sourceError);
      await handling;

      expect(pending.cancel).toHaveBeenCalledWith(sourceError);
      expect(pending.complete).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('cancels the claim when the source closes prematurely', async () => {
      const { req, res } = createReqRes();
      const pending = claimedPending();
      claimSpy.mockReturnValue({
        status: 'claimed',
        pending,
      });

      const handling = handlePostResponse(req, res);
      req.write(Buffer.from([1, 2]));
      req.destroy();
      await handling;

      expect(pending.cancel).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ERR_STREAM_PREMATURE_CLOSE' }),
      );
      expect(pending.complete).not.toHaveBeenCalled();
    });

    it('cancels the claim and returns 500 when the destination fails', async () => {
      const { req, res } = createReqRes();
      const destinationError = new Error('original response failed');
      const destination = new Writable({
        write(_chunk, _encoding, callback) {
          callback(destinationError);
        },
      });
      const pending = claimedPending(destination);
      claimSpy.mockReturnValue({
        status: 'claimed',
        pending,
      });

      const handling = handlePostResponse(req, res);
      req.end(frame({ status: 200, headers: {} }, Buffer.from('body')));
      await handling;

      expect(pending.cancel).toHaveBeenCalledWith(destinationError);
      expect(pending.complete).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(req.destroyed).toBe(true);
    });

    it('logs incomplete prefix diagnostics, cancels, and returns only the generic failure', async () => {
      const { req, res } = createReqRes();
      const pending = claimedPending();
      claimSpy.mockReturnValue({
        status: 'claimed',
        pending,
      });

      const handling = handlePostResponse(req, res);
      req.end(Buffer.from([1, 2, 3]));
      await handling;

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          failureReason: 'incomplete-prefix',
          receivedPrefixBytes: 3,
          expectedPrefixBytes: 4,
          error: expect.any(Error),
        }),
        'Failed handling POST response stream pipeline.',
      );
      expect(pending.cancel).toHaveBeenCalledWith(
        expect.objectContaining({
          diagnostics: {
            failureReason: 'incomplete-prefix',
            receivedPrefixBytes: 3,
            expectedPrefixBytes: 4,
          },
        }),
      );
      expect(pending.complete).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Failed to handle response stream.',
      });
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: expect.any(String) }),
      );
    });

    it('logs incomplete metadata diagnostics, cancels, and does not acknowledge success', async () => {
      const { req, res } = createReqRes();
      const pending = claimedPending();
      claimSpy.mockReturnValue({
        status: 'claimed',
        pending,
      });
      const { prefix, metadata } = framedParts();
      const receivedMetadataBytes = metadata.length - 2;

      const handling = handlePostResponse(req, res);
      req.end(
        Buffer.concat([prefix, metadata.subarray(0, receivedMetadataBytes)]),
      );
      await handling;

      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          failureReason: 'incomplete-metadata',
          receivedMetadataBytes,
          expectedMetadataBytes: metadata.length,
          error: expect.any(Error),
        }),
        'Failed handling POST response stream pipeline.',
      );
      expect(pending.cancel).toHaveBeenCalledWith(
        expect.objectContaining({
          diagnostics: {
            failureReason: 'incomplete-metadata',
            receivedMetadataBytes,
            expectedMetadataBytes: metadata.length,
          },
        }),
      );
      expect(pending.complete).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Failed to handle response stream.',
      });
    });

    it('returns 500 without reading the body when the response is already claimed', async () => {
      const { req, res } = createReqRes();
      claimSpy.mockReturnValue({
        status: 'already-claimed',
      });

      await handlePostResponse(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Unable to find request matching streaming id.',
      });
    });

    it('returns 401 when the JWT owner does not match the pending response owner', async () => {
      (getConfig as jest.Mock).mockReturnValue({
        BROKER_SERVER_MANDATORY_AUTH_ENABLED: true,
      });
      const { req, res } = createReqRes();
      const encodedHeader = Buffer.from(
        JSON.stringify({ alg: 'none' }),
      ).toString('base64url');
      const encodedPayload = Buffer.from(
        JSON.stringify({ azp: 'broker-client-a' }),
      ).toString('base64url');
      req.headers.authorization = `Bearer ${encodedHeader}.${encodedPayload}.`;
      claimSpy.mockReturnValue({
        status: 'owner-mismatch',
      });

      await handlePostResponse(req, res);

      expect(pendingResponseRegistry.claim).toHaveBeenCalledWith('stream-1', {
        brokerAppClientId: 'broker-client-a',
        enforceBrokerOwnership: true,
      });
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid Broker client credentials.',
      });
    });
  });
});

describe('broker server API', () => {
  describe('POST /response-data/:brokerToken/:streamingId', () => {
    beforeEach(() => {
      (getConfig as jest.Mock).mockReturnValue({
        BROKER_SERVER_MANDATORY_AUTH_ENABLED: false,
      });
    });

    it('forwards body bytes before the POST request ends and acknowledges after delivery', async () => {
      const streamingID = `stream-${Date.now()}`;
      const received: Buffer[] = [];
      let firstBodySeen!: () => void;
      const firstBody = new Promise<void>(
        (resolve) => (firstBodySeen = resolve),
      );
      const originalResponse = Object.assign(
        new Writable({
          write(chunk, _encoding, callback) {
            received.push(chunk);
            firstBodySeen();
            callback();
          },
        }),
        {
          status: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
        },
      );
      pendingResponseRegistry.register(streamingID, {
        response: originalResponse as any,
        brokerAppClientId: null,
      });

      const app = express();
      app.post('/response-data/:brokerToken/:streamingId', handlePostResponse);
      const server = http.createServer(app);
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });

      try {
        const { port } = server.address() as AddressInfo;
        let acknowledgementReceived = false;
        const acknowledgement = new Promise<{ status: number; body: string }>(
          (resolve, reject) => {
            const request = http.request(
              {
                host: '127.0.0.1',
                port,
                method: 'POST',
                path: `/response-data/token/${streamingID}`,
              },
              (response) => {
                const responseBody: Buffer[] = [];
                response.on('data', (chunk) => responseBody.push(chunk));
                response.on('end', () => {
                  acknowledgementReceived = true;
                  resolve({
                    status: response.statusCode!,
                    body: Buffer.concat(responseBody).toString(),
                  });
                });
              },
            );
            request.on('error', reject);

            const { prefix, metadata } = framedParts();
            request.write(prefix.subarray(0, 1));
            request.write(prefix.subarray(1));
            request.write(metadata.subarray(0, 5));
            request.write(
              Buffer.concat([
                metadata.subarray(5),
                Buffer.from('body-before-eof'),
              ]),
            );

            firstBody.then(() => {
              expect(acknowledgementReceived).toBe(false);
              request.end(Buffer.from('-after-eof'));
            }, reject);
          },
        );

        await expect(acknowledgement).resolves.toEqual({
          status: 200,
          body: '{}',
        });
        expect(Buffer.concat(received).toString()).toBe(
          'body-before-eof-after-eof',
        );
        expect(originalResponse.status).toHaveBeenCalledWith(206);
        expect(originalResponse.set).toHaveBeenCalledWith({
          'x-spike': 'pipeline',
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });

    it.each([
      ['incomplete prefix', () => Buffer.from([1, 2, 3])],
      [
        'incomplete metadata',
        () => {
          const { prefix, metadata } = framedParts();
          return Buffer.concat([prefix, metadata.subarray(0, 7)]);
        },
      ],
    ])(
      'returns only the generic HTTP failure for %s framing',
      async (label, createPayload) => {
        const streamingID = `${label.replace(' ', '-')}-${Date.now()}`;
        const originalResponse = Object.assign(new PassThrough(), {
          status: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
        });
        originalResponse.on('data', () => undefined);
        originalResponse.on('error', () => undefined);
        pendingResponseRegistry.register(streamingID, {
          response: originalResponse as any,
          brokerAppClientId: null,
        });

        const app = express();
        app.post(
          '/response-data/:brokerToken/:streamingId',
          handlePostResponse,
        );
        const server = http.createServer(app);
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
          });
        });

        try {
          const { port } = server.address() as AddressInfo;
          const result = await new Promise<{ status: number; body: string }>(
            (resolve, reject) => {
              const request = http.request(
                {
                  host: '127.0.0.1',
                  port,
                  method: 'POST',
                  path: `/response-data/token/${streamingID}`,
                },
                (response) => {
                  const responseBody: Buffer[] = [];
                  response.on('data', (chunk) => responseBody.push(chunk));
                  response.on('end', () =>
                    resolve({
                      status: response.statusCode!,
                      body: Buffer.concat(responseBody).toString(),
                    }),
                  );
                },
              );
              request.once('error', reject);
              request.end(createPayload());
            },
          );

          expect(result).toEqual({
            status: 500,
            body: '{"message":"Failed to handle response stream."}',
          });
          expect(originalResponse.destroyed).toBe(true);
          expect(pendingResponseRegistry.claim(streamingID)).toEqual({
            status: 'not-found',
          });
        } finally {
          pendingResponseRegistry.cancel(streamingID);
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
        }
      },
    );

    it('aborts delivery without forwarding body bytes when response headers are already committed', async () => {
      const streamingID = `committed-${Date.now()}`;
      let originalResponse!: Response;
      let registered!: () => void;
      const registration = new Promise<void>(
        (resolve) => (registered = resolve),
      );
      const app = express();
      app.get('/original', (_req, res) => {
        originalResponse = res;
        pendingResponseRegistry.register(streamingID, {
          response: res,
          brokerAppClientId: null,
        });
        registered();
      });
      app.post('/response-data/:brokerToken/:streamingId', handlePostResponse);
      const server = http.createServer(app);
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });

      try {
        const { port } = server.address() as AddressInfo;
        const originalBody: Buffer[] = [];
        const originalResult = new Promise<{
          status: number;
          aborted: boolean;
        }>((resolve, reject) => {
          const request = http.get(
            { host: '127.0.0.1', port, path: '/original' },
            (response) => {
              response.on('data', (chunk) => originalBody.push(chunk));
              response.once('aborted', () =>
                resolve({ status: response.statusCode!, aborted: true }),
              );
              response.once('end', () =>
                resolve({ status: response.statusCode!, aborted: false }),
              );
              response.on('error', () => undefined);
            },
          );
          request.once('error', reject);
        });
        await registration;
        originalResponse.flushHeaders();
        expect(originalResponse.headersSent).toBe(true);

        const postResult = new Promise<
          { type: 'response'; status: number; body: string } | { type: 'error' }
        >((resolve) => {
          const request = http.request(
            {
              host: '127.0.0.1',
              port,
              method: 'POST',
              path: `/response-data/token/${streamingID}`,
            },
            (response) => {
              const responseBody: Buffer[] = [];
              response.on('data', (chunk) => responseBody.push(chunk));
              response.on('end', () =>
                resolve({
                  type: 'response',
                  status: response.statusCode!,
                  body: Buffer.concat(responseBody).toString(),
                }),
              );
            },
          );
          request.once('error', () => resolve({ type: 'error' }));
          request.end(
            frame({ status: 500 }, Buffer.from('must-not-be-forwarded')),
          );
        });

        const postOutcome = await postResult;
        if (postOutcome.type === 'response') {
          expect(postOutcome.status).not.toBe(200);
        }
        await expect(originalResult).resolves.toEqual({
          status: 200,
          aborted: true,
        });
        expect(originalBody).toEqual([]);
        expect(pendingResponseRegistry.claim(streamingID)).toEqual({
          status: 'not-found',
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });
  });
});
