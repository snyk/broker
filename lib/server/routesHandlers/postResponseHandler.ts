import { Request, Response } from 'express';

import { log as logger } from '../../logs/logger';
import { getDesensitizedToken } from '../utils/token';
import { incrementHttpRequestsTotal } from '../../common/utils/metrics';
import { StreamResponseHandler } from '../../hybrid-sdk/http/server-post-stream-handler';
import { getConfig } from '../../common/config/config';
import { decode } from 'jsonwebtoken';

export const handlePostResponse = (req: Request, res: Response) => {
  incrementHttpRequestsTotal(false, 'data-response');
  const token = req.params.brokerToken;
  const streamingID = req.params.streamingId;
  const desensitizedToken = getDesensitizedToken(token);
  const logContext = {
    hashedToken: desensitizedToken.hashedToken,
    maskedToken: desensitizedToken.maskedToken,
    streamingID,
    requestId: req.headers['snyk-request-id'],
    actingOrgPublicId: req.headers['snyk-acting-org-public-id'],
    actingGroupPublicId: req.headers['snyk-acting-group-public-id'],
    productLine: req.headers['snyk-product-line'],
    flow: req.headers['snyk-flow-name'],
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
  if (getConfig().BROKER_SERVER_MANDATORY_AUTH_ENABLED) {
    const credentials = req.headers.authorization;
    if (!credentials) {
      logger.error(
        logContext,
        'Invalid Broker Client credentials on response data',
      );
      res.status(401).json({ message: 'Invalid Broker Client credentials' });
      return;
    }
    const decodedJwt = credentials
      ? decode(credentials!.replace(/bearer /i, ''), {
          complete: true,
        })
      : null;

    const brokerAppClientId = decodedJwt ? decodedJwt?.payload['azp'] : '';
    if (
      !brokerAppClientId ||
      brokerAppClientId != streamHandler.streamResponse.brokerAppClientId
    ) {
      logger.error(
        logContext,
        'Invalid Broker Client credentials for stream on response data',
      );
      res.status(401).json({ message: 'Invalid Broker Client credentials' });
      return;
    }
  }
  let statusAndHeaders = '';
  let statusAndHeadersSize = -1;

  req
    .on('data', function (data) {
      try {
        logger.trace(
          { ...logContext, dataLength: Buffer.byteLength(data, 'utf8') },
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

        let statusAndHeadersLength = Buffer.byteLength(
          statusAndHeaders,
          'utf8',
        );
        if (
          statusAndHeadersSize > 0 &&
          statusAndHeadersLength < statusAndHeadersSize
        ) {
          const endPosition = Math.min(
            bytesRead + statusAndHeadersSize - statusAndHeadersLength,
            data.length,
          );
          logger.trace(
            { ...logContext, bytesRead, endPosition },
            'Reading ioJson',
          );
          statusAndHeaders += data.toString('utf8', bytesRead, endPosition);
          bytesRead = endPosition;
          statusAndHeadersLength = Buffer.byteLength(statusAndHeaders, 'utf8');
          if (statusAndHeadersLength === statusAndHeadersSize) {
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
                currentSize: statusAndHeadersLength,
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
