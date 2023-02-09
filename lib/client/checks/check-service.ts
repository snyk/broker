import { CheckId, CheckResult } from './types';

export interface CheckService {
  run(checkId: CheckId): Promise<CheckResult>;
}
