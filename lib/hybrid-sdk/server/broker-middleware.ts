import { Request, Response, NextFunction } from 'express';
import { log as logger } from '../../logs/logger';
import { getConfig } from '../common/config/config';
export const validateBrokerTypeMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const config = getConfig();
  const localConfig = config as unknown as Record<string, string>;
  if (
    localConfig.brokerServerUniversalConfigEnabled &&
    !req?.headers['x-snyk-broker-type']
  ) {
    const logContext = { url: req.url, headers: req.headers };
    logger.warn(
      { logContext },
      'Error: Request does not contain the x-snyk-broker-type header.',
    );
    // Will eventually return an error when all services will have this enabled
    // return res.status(400).json({ error: 'Missing x-broker-type header' });
  }
  next(); // Passes the request to the next middleware
};
