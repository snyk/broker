import { Request, Response } from 'express';
import { decode } from 'jsonwebtoken';
import { pipeline } from 'node:stream/promises';
import { log as logger } from '../../../logs/logger';
import { getConfig } from '../../common/config/config';
import { incrementHttpRequestsTotal } from '../../common/utils/metrics';
import {
  PendingResponse,
  pendingResponseRegistry,
} from '../../http/server-post-stream-handler';
import {
  ResponseFrameDecoder,
  ResponseFrameError,
  ResponseMetadata,
} from '../../http/response-frame-decoder';
import { getDesensitizedToken } from '../utils/token';

export const handlePostResponse = async (
  req: Request,
  res: Response,
): Promise<void> => {
  incrementHttpRequestsTotal(false, 'data-response');
  const token = req.params.brokerToken;
  const streamingID = req.params.streamingId;
  const desensitizedToken = getDesensitizedToken(token);
  const logContext = {
    hashedToken: desensitizedToken.hashedToken,
    maskedToken: desensitizedToken.maskedToken,
    streamingID,
    requestId: req.requestId,
    actingOrgPublicId: req.headers['snyk-acting-org-public-id'],
    actingGroupPublicId: req.headers['snyk-acting-group-public-id'],
    productLine: req.headers['snyk-product-line'],
    flow: req.headers['snyk-flow-name'],
    payloadSize: 0,
  };
  logger.debug(logContext, 'Handling response-data request.');
  req['maskedToken'] = desensitizedToken.maskedToken;
  req['hashedToken'] = desensitizedToken.hashedToken;

  let pending: PendingResponse | undefined;
  try {
    const enforceBrokerOwnership =
      getConfig().BROKER_SERVER_MANDATORY_AUTH_ENABLED;
    const credentials = req.headers.authorization;
    if (enforceBrokerOwnership && !credentials) {
      logger.error(
        logContext,
        'Invalid Broker client credentials on response data.',
      );
      res.status(401).json({ message: 'Invalid Broker client credentials.' });
      return;
    }

    const decodedJwt =
      enforceBrokerOwnership && credentials
        ? decode(credentials.replace(/bearer /i, ''), { complete: true })
        : null;
    const brokerAppClientId = decodedJwt
      ? (decodedJwt.payload['azp'] as string)
      : undefined;
    const claim = pendingResponseRegistry.claim(streamingID, {
      brokerAppClientId,
      enforceBrokerOwnership,
    });

    if (claim.status === 'owner-mismatch') {
      logger.error(
        logContext,
        'Invalid Broker client credentials for stream on response data.',
      );
      res.status(401).json({ message: 'Invalid Broker client credentials.' });
      return;
    }
    if (claim.status !== 'claimed') {
      logger.error(
        { ...logContext, claimStatus: claim.status },
        'Unable to claim request matching streaming id.',
      );
      res
        .status(500)
        .json({ message: 'Unable to find request matching streaming id.' });
      return;
    }
    pending = claim.pending;

    const decoder = new ResponseFrameDecoder({
      onMetadata: (metadata) => {
        logMetadata(logContext, metadata);
        pending!.applyMetadata(metadata);
      },
    });

    await pipeline(req, decoder, pending.destination);
    pending.complete(decoder.bodyBytes);
    res.status(200).json({});
  } catch (error) {
    const streamError = error as Error;
    pending?.cancel(streamError);
    const framingDiagnostics =
      streamError instanceof ResponseFrameError
        ? streamError.diagnostics
        : undefined;
    logger.error(
      { ...logContext, ...framingDiagnostics, error: streamError },
      'Failed handling POST response stream pipeline.',
    );
    // This slice intentionally has one generic framing/delivery failure status.
    // A protocol-hardening slice can split malformed, oversized and server
    // failures without making 500 the long-term wire contract here.
    if (!res.headersSent && !res.destroyed) {
      res.status(500).json({ message: 'Failed to handle response stream.' });
    }
  }
};

const logMetadata = (
  logContext: Record<string, unknown>,
  metadata: ResponseMetadata,
): void => {
  const logData = {
    ...logContext,
    responseStatus: metadata.status,
    errorType: metadata.errorType,
  };
  const logMessage = 'Handling response-data request - io bits';
  if (metadata.status > 299 && metadata.status !== 404) {
    logger.info(logData, logMessage);
  } else {
    logger.debug(logData, logMessage);
  }
};
