import logger = require('../../../log');
import { CheckResult } from '../types';
import { Request, Response } from 'express';
import { checksConfig } from '../index';

export const handleChecksRoute = (
  config: any,
): ((_: Request, res: Response) => void) => {
  return async (_: Request, res: Response) => {
    try {
      const { httpCheckService, preflightCheckStore } = await checksConfig(
        config,
      );
      const checkResults: CheckResult[] = [];

      const checks = await preflightCheckStore.getAll();
      for (const check of checks) {
        const checkResult = await httpCheckService.run(check.checkId);
        checkResults.push(checkResult);
      }
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
      const { httpCheckService, preflightCheckStore } = await checksConfig(
        config,
      );

      const check = await preflightCheckStore.get(req.params.checkId);
      if (check === null) {
        res.sendStatus(404);
        return;
      }

      const checkResult = await httpCheckService.run(check.checkId);
      res.status(200).json(checkResult);
    } catch (error) {
      logger.error(
        { error },
        `Error executing http check with checkId: ${req.params.checkId}`,
      );
      res.status(500).json({ error: error });
    }
  };
};
