import http from 'node:http';
import { AddressInfo, Socket } from 'node:net';

import { setConfig } from '../../../../../lib/hybrid-sdk/common/config/config';
import { BrokerServerPostResponseHandler } from '../../../../../lib/hybrid-sdk/http/downstream-post-stream-to-server';

describe('hybrid-sdk/http', () => {
  describe('BrokerServerPostResponseHandler', () => {
    describe('response body URL substitution', () => {
      const responseUrl = 'http://private-registry.example/artifactory';
      const replacementUrl =
        'http://internal-broker-server-next/broker/test-broker-token';
      const originalBody = JSON.stringify({
        tarball: `${responseUrl}/pkg.tgz`,
      });
      const transformedBody = JSON.stringify({
        tarball: `${replacementUrl}/pkg.tgz`,
      });
      let brokerServer: http.Server;
      let brokerServerUrl: string;
      let requestBodyPromise: Promise<Buffer>;

      beforeEach(async () => {
        let resolveRequestBody: (body: Buffer) => void;
        requestBodyPromise = new Promise<Buffer>((resolve) => {
          resolveRequestBody = resolve;
        });
        brokerServer = http.createServer((request, response) => {
          const chunks: Buffer[] = [];
          request.on('data', (chunk) => chunks.push(chunk));
          request.on('end', () => {
            resolveRequestBody(Buffer.concat(chunks));
            response.writeHead(200);
            response.end('OK');
          });
        });
        await new Promise<void>((resolve, reject) => {
          brokerServer.once('error', reject);
          brokerServer.listen(0, '127.0.0.1', () => {
            brokerServer.off('error', reject);
            resolve();
          });
        });
        const address = brokerServer.address() as AddressInfo;
        brokerServerUrl = `http://127.0.0.1:${address.port}`;
      });

      afterEach(async () => {
        if (!brokerServer.listening) {
          return;
        }
        await new Promise<void>((resolve, reject) => {
          brokerServer.close((error) => (error ? reject(error) : resolve()));
        });
      });

      async function relay(
        config: Record<string, any>,
        contentType = 'application/json',
        body = originalBody,
        contentLengthHeader = 'content-length',
        additionalHeaders: Record<string, string> = {},
      ) {
        setConfig({
          brokerServerUrl,
          universalBrokerEnabled: false,
          universalBrokerGa: false,
          ...config,
        });
        const handler = new BrokerServerPostResponseHandler(
          {} as any,
          configWithServerUrl(config),
          'test-broker-token',
          123,
          'test-request-id',
          'primary',
        );
        const socket = new Socket();
        const downstreamResponse = new http.IncomingMessage(socket);
        downstreamResponse.statusCode = 207;
        const downstreamHeaders = {
          'content-type': contentType,
          [contentLengthHeader]: `${Buffer.byteLength(body, 'utf8')}`,
          'x-downstream-header': 'preserved',
          ...additionalHeaders,
        };
        downstreamResponse.headers = downstreamHeaders;

        const forwardPromise = handler.forwardRequest(
          downstreamResponse,
          'test-streaming-id',
        );
        process.nextTick(() => {
          downstreamResponse.push(body);
          downstreamResponse.push(null);
        });
        await forwardPromise;
        const requestBody = await requestBodyPromise;
        socket.destroy();

        const metadataLength = requestBody.readUInt32LE(0);
        const metadataEnd = 4 + metadataLength;
        const metadataBytes = requestBody.subarray(4, metadataEnd);
        return {
          body: requestBody.subarray(metadataEnd).toString('utf8'),
          metadataBytes,
          metadataLength,
          prefix: requestBody.subarray(0, 4),
          downstreamHeaders,
          metadata: JSON.parse(metadataBytes.toString('utf8')),
        };
      }

      function configWithServerUrl(config: Record<string, any>) {
        return {
          brokerServerUrl,
          universalBrokerEnabled: false,
          universalBrokerGa: false,
          ...config,
        };
      }

      it('removes stale content length and streams the transformed body', async () => {
        const relayed = await relay(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          originalBody,
          'Content-Length',
        );

        expect(relayed.metadata).toEqual({
          status: 207,
          headers: {
            'content-type': 'application/json',
            'x-downstream-header': 'preserved',
          },
        });
        expect(relayed.body).toBe(transformedBody);
        expect(Buffer.byteLength(relayed.body, 'utf8')).not.toBe(
          Buffer.byteLength(originalBody, 'utf8'),
        );
        expect(relayed.downstreamHeaders).toEqual({
          'content-type': 'application/json',
          'Content-Length': `${Buffer.byteLength(originalBody, 'utf8')}`,
          'x-downstream-header': 'preserved',
        });
      });

      it('preserves fixed-length metadata and body without configuration', async () => {
        const relayed = await relay({});

        expect(relayed.metadata).toEqual({
          status: 207,
          headers: relayed.downstreamHeaders,
        });
        expect(relayed.body).toBe(originalBody);
      });

      it('preserves fixed-length metadata and body for a non-JSON response', async () => {
        const relayed = await relay(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'text/plain',
        );

        expect(relayed.metadata).toEqual({
          status: 207,
          headers: relayed.downstreamHeaders,
        });
        expect(relayed.body).toBe(originalBody);
      });

      it('removes content length before an eligible body with no matching URL', async () => {
        const bodyWithoutMatch = JSON.stringify({ message: 'no URL here' });
        const relayed = await relay(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          bodyWithoutMatch,
        );

        expect(relayed.metadata.headers).toEqual({
          'content-type': 'application/json',
          'x-downstream-header': 'preserved',
        });
        expect(relayed.body).toBe(bodyWithoutMatch);
      });

      it('preserves binary framing bytes outside the body transformer', async () => {
        const targetMetadataLength = 384;
        const headersWithoutContentLength = {
          'content-type': 'application/json',
          'x-downstream-header': 'preserved',
          'x-repro-pad': '',
        };
        const metadataWithoutPadding = JSON.stringify({
          status: 207,
          headers: headersWithoutContentLength,
        });
        const paddingLength =
          targetMetadataLength - Buffer.byteLength(metadataWithoutPadding);

        const relayed = await relay(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          originalBody,
          'content-length',
          { 'x-repro-pad': 'p'.repeat(paddingLength) },
        );

        expect(relayed.metadataLength).toBe(targetMetadataLength);
        expect(relayed.prefix).toEqual(Buffer.from([0x80, 0x01, 0x00, 0x00]));
        expect(relayed.metadataBytes).toHaveLength(targetMetadataLength);
        expect(relayed.metadata.headers['x-repro-pad']).toHaveLength(
          paddingLength,
        );
        expect(relayed.body).toBe(transformedBody);
      });

      it('keeps matching URLs in metadata while substituting the response body', async () => {
        const metadataUrl = `${responseUrl}/repro-metadata`;
        const expectedMetadata = JSON.stringify({
          status: 207,
          headers: {
            'content-type': 'application/json',
            'x-downstream-header': 'preserved',
            'x-repro-url': metadataUrl,
          },
        });

        const relayed = await relay(
          {
            RES_BODY_URL_SUB: responseUrl,
            BROKER_TOKEN: 'test-broker-token',
          },
          'application/json',
          originalBody,
          'content-length',
          { 'x-repro-url': metadataUrl },
        );

        expect(relayed.metadataLength).toBe(
          Buffer.byteLength(expectedMetadata, 'utf8'),
        );
        expect(relayed.metadataBytes).toEqual(Buffer.from(expectedMetadata));
        expect(relayed.metadata.headers['x-repro-url']).toBe(metadataUrl);
        expect(relayed.body).toBe(transformedBody);
      });
    });
  });
});
