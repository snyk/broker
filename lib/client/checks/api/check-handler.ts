import { Express, Request, Response } from 'express';
import { Check, CheckResult } from '../types';
import { CheckService } from '../check-service';

export const applyPreflightChecksRoutes = (
  router: Express,
  checks: Check[],
  checkService: CheckService,
) => {
  router.get('/health/checks', async function (req: Request, res: Response) {
    const data: CheckResult[] = [];

    try {
      for (let i = 0; i < checks.length; i++) {
        await checkService.run(checks[i].checkId);
        // data.push({ id: check.id, status: check.status });
      }
    } catch (error) {
      console.log(error);
    }
    res.status(200).json(data);
  });
};
