import { Check, CheckId } from './types';
import { CheckStore } from './check-store';

export class PreflightCheckStore implements CheckStore {
  private preflightChecks: Check[] = [];

  async add(check: Check): Promise<void> {
    if ((await this.get(check.checkId)) === null) {
      this.preflightChecks.push(check);
    }
  }

  async get(checkId: CheckId): Promise<Check | null> {
    const entry = this.preflightChecks.find((c) => c.checkId === checkId);
    return Promise.resolve(entry !== undefined ? entry : null);
  }

  async getAll(): Promise<Check[]> {
    return [...this.preflightChecks];
  }
}
