import { Request, Response } from 'express';
import { StreamResponseHandler } from '../../common/http/server-post-stream-handler';
import { log as logger } from '../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { incrementHttpRequestsTotal } from '../../common/utils/metrics';

export const handlePostResponse = (req: Request, res: Response) => {
  incrementHttpRequestsTotal(false);
  const token = req.params.brokerToken;
  const streamingID = req.params.streamingId;
  const desensitizedToken = getDesensitizedToken(token);
  const logContext = {
    hashedToken: desensitizedToken.hashedToken,
    maskToken: desensitizedToken.maskedToken,
    streamingID,
    requestId: req.headers['snyk-request-id'],
  };
  logger.info(logContext, 'Handling response-data request');
  req['maskedToken'] = desensitizedToken.maskedToken;
  req['hashedToken'] = desensitizedToken.hashedToken;

  const streamHandler = StreamResponseHandler.create(streamingID);
  if (!streamHandler) {
    logger.error(logContext, 'unable to find request matching streaming id');
    res
      .status(500)
      .json({ message: 'unable to find request matching streaming id' });
    return;
  }
  let statusAndHeaders = '';
  let statusAndHeadersSize = -1;

  req
    .on('data', function (data) {
      try {
        logger.trace(
          { ...logContext, dataLength: data.length },
          'Received data event',
        );
        let bytesRead = 0;
        if (statusAndHeadersSize === -1) {
          bytesRead += 4;
          statusAndHeadersSize = data.readUInt32LE();
          logger.debug(
            { ...logContext, statusAndHeadersSize },
            'request metadata size read from stream',
          );
        }

        if (
          statusAndHeadersSize > 0 &&
          statusAndHeaders.length < statusAndHeadersSize
        ) {
          const endPosition = Math.min(
            bytesRead + statusAndHeadersSize - statusAndHeaders.length,
            data.length,
          );
          logger.trace(
            { ...logContext, bytesRead, endPosition },
            'Reading ioJson',
          );
          statusAndHeaders += data.toString('utf8', bytesRead, endPosition);
          bytesRead = endPosition;

          if (statusAndHeaders.length === statusAndHeadersSize) {
            logger.trace(
              { ...logContext, statusAndHeaders },
              'Converting to json',
            );
            const statusAndHeadersJson = JSON.parse(statusAndHeaders);
            const logData = {
              ...logContext,
              responseStatus: statusAndHeadersJson.status,
              responseHeaders: statusAndHeadersJson.headers,
            };
            const logMessage = 'Handling response-data request - io bits';
            if (
              statusAndHeadersJson.status > 299 &&
              statusAndHeadersJson.status !== 404
            ) {
              logger.info(logData, logMessage);
            } else {
              logger.debug(logData, logMessage);
            }
            streamHandler.writeStatusAndHeaders(statusAndHeadersJson);
          } else {
            logger.trace(
              {
                ...logContext,
                currentSize: statusAndHeaders.length,
                expectedSize: statusAndHeadersSize,
              },
              'Was unable to fit all information into a single data object',
            );
          }
        }

        if (bytesRead < data.length) {
          logger.trace(
            logContext,
            'Handling response-data request - data part',
          );
          streamHandler.writeChunk(
            data.subarray(bytesRead, data.length),
            (streamBuffer) => {
              logger.trace(logContext, 'pausing request stream');
              req.pause();
              streamBuffer.once('drain', () => {
                logger.trace(logContext, 'resuming request stream');
                req.resume();
              });
            },
          );
        }
      } catch (e) {
        logger.error(
          { ...logContext, statusAndHeaders, statusAndHeadersSize, error: e },
          'caught error handling data event for streaming HTTP response',
        );
      }
    })
    .on('end', function () {
      logger.debug(logContext, 'Handling response-data request - end part');
      streamHandler.finished();
      res.status(200).json({});
    })
    .on('error', (err) => {
      logger.error(
        { ...logContext, error: err },
        'received error handling POST from client',
      );
      streamHandler.destroy(err);
      res.status(500).json({ err });
    });
};
