import nock from 'nock';
import {
  makeRequestToDownstream,
  makeSingleRawRequestToDownstream,
  makeStreamingRequestToDownstream,
} from '../../../../../lib/hybrid-sdk/http/request';
import { log as logger } from '../../../../../lib/logs/logger';

jest.mock('../../../../../lib/logs/logger');

describe('http/request', () => {
  const downstreamUrl = 'http://downstream-service.com';
  const downstreamPath = '/some-path';
  const fullDownstreamUrl = `${downstreamUrl}${downstreamPath}`;

  afterEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
  });

  describe('makeRequestToDownstream', () => {
    it('should log requestDurationMs on a successful request', async () => {
      nock(downstreamUrl).post(downstreamPath).reply(200, { success: true });

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
      };

      await makeRequestToDownstream(request);

      expect(logger.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          statusCode: 200,
          url: fullDownstreamUrl,
        }),
        'Successful request',
      );

      const [logContext] = (logger.trace as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });

    it('should log requestDurationMs on a failed request', async () => {
      nock(downstreamUrl).post(downstreamPath).reply(500, { error: 'chaos' });

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
      };

      await makeRequestToDownstream(request);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          statusCode: 500,
          url: fullDownstreamUrl,
        }),
        'Non 2xx HTTP Code Received',
      );

      const [logContext] = (logger.debug as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });

    it('should log requestDurationMs when a request error occurs', async () => {
      nock(downstreamUrl).post(downstreamPath).replyWithError('network error');

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
      };

      // We expect this to reject, but we still want to check the logs
      await expect(makeRequestToDownstream(request, 0)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          err: expect.any(Error),
        }),
        expect.stringContaining('Error making streaming request to downstream'),
      );

      const [logContext] = (logger.error as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });
  });

  describe('makeStreamingRequestToDownstream', () => {
    it('should log requestDurationMs on a successful request', async () => {
      nock(downstreamUrl).post(downstreamPath).reply(200, { success: true });

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
      };

      await makeStreamingRequestToDownstream(request);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          statusCode: 200,
          url: fullDownstreamUrl,
        }),
        'Successful downstream request.',
      );

      const [logContext] = (logger.debug as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });

    it('should log requestDurationMs on a failed request', async () => {
      nock(downstreamUrl).post(downstreamPath).reply(500, { error: 'chaos' });

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
      };

      await makeStreamingRequestToDownstream(request);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          statusCode: 500,
          url: fullDownstreamUrl,
        }),
        'Non 2xx HTTP Code Received',
      );

      const [logContext] = (logger.warn as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });

    it('should log requestDurationMs when a request error occurs', async () => {
      nock(downstreamUrl).post(downstreamPath).replyWithError('network error');

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
      };

      // We expect this to reject, but we still want to check the logs
      await expect(
        makeStreamingRequestToDownstream(request, 0),
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          err: expect.any(Error),
        }),
        expect.stringContaining('Error making request to downstream'),
      );

      const [logContext] = (logger.error as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });
  });

  describe('makeSingleRawRequestToDownstream', () => {
    it('should log requestDurationMs on a successful request', async () => {
      nock(downstreamUrl).post(downstreamPath).reply(200, { success: true });

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
      };

      await makeSingleRawRequestToDownstream(request);

      expect(logger.trace).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          statusCode: 200,
          url: fullDownstreamUrl,
        }),
        'Successful raw request',
      );

      const [logContext] = (logger.trace as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });

    it('should log requestDurationMs when a request error occurs', async () => {
      nock(downstreamUrl).post(downstreamPath).replyWithError('network error');

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
      };

      await expect(makeSingleRawRequestToDownstream(request)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          error: expect.any(Error),
        }),
        'Error making raw request to downstream.',
      );

      const [logContext] = (logger.error as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });

    it('should log requestDurationMs on a timeout', async () => {
      nock(downstreamUrl).post(downstreamPath).delay(200).reply(200, 'OK');

      const request = {
        url: fullDownstreamUrl,
        method: 'POST' as const,
        headers: {},
        body: JSON.stringify({ key: 'value' }),
        timeoutMs: 100,
      };

      await expect(makeSingleRawRequestToDownstream(request)).rejects.toThrow(
        `Request to URI ${fullDownstreamUrl} timed out.`,
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          requestDurationMs: expect.any(Number),
          url: fullDownstreamUrl,
        }),
        'Raw request to URI timed out.',
      );

      const [logContext] = (logger.info as jest.Mock).mock.calls[0];
      expect(logContext.requestDurationMs).toBeGreaterThan(0);
    });
  });
});
