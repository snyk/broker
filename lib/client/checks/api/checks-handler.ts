import { log as logger } from '../../../log';
import { Request, Response } from 'express';
import { getHttpChecks } from '../http';
import type { CheckResult } from '../types';
import type { Config } from '../../config';

export const handleChecksRoute = (
  config: any,
): ((_: Request, res: Response) => void) => {
  return async (_: Request, res: Response) => {
    try {
      const checks = getHttpChecks(config as Config).filter((c) => c.enabled);

      const checkResults: CheckResult[] = [];
      const results = await Promise.allSettled(
        checks.map(async (c) => c.check(config)),
      );
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          checkResults.push(r.value);
        } else {
          logger.error(
            { error: r.reason },
            'Unexpected error when executing checks',
          );
        }
      });
      res.status(200).json(checkResults);
    } catch (error) {
      logger.error({ error }, 'Error executing http checks');
      res.status(500).json({ error: error });
    }
  };
};

export const handleCheckIdsRoutes = (
  config: any,
): ((req: Request, res: Response) => void) => {
  return async (req: Request, res: Response) => {
    try {
      const check = getHttpChecks(config as Config)
        .filter((c) => c.enabled)
        .find((c) => c.id === req.params.checkId);

      if (check === undefined) {
        res.sendStatus(404);
        return;
      }

      const checkResult = await check.check(config);
      res.status(200).json(checkResult);
    } catch (error) {
      logger.error(
        { error },
        `Error executing check with id: ${req.params.checkId}`,
      );
      res.status(500).json({ error: error });
    }
  };
};
