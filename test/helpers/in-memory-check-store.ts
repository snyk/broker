import { Check, CheckId } from '../../lib/client/checks/types';
import { CheckStore } from '../../lib/client/checks/check-store';

export class InMemoryCheckStore implements CheckStore {
  constructor(private readonly testChecks: Check[]) {}

  async add(check: Check): Promise<void> {
    if ((await this.get(check.checkId)) === null) {
      this.testChecks.push(check);
    }
  }

  async get(checkId: CheckId): Promise<Check | null> {
    const entry = this.testChecks.find((c) => c.checkId === checkId);
    return Promise.resolve(entry !== undefined ? entry : null);
  }

  async getAll(): Promise<Check[]> {
    return [...this.testChecks];
  }
}

export const createInMemoryCheckStore = (
  checks: Check[],
): InMemoryCheckStore => {
  return new InMemoryCheckStore(checks);
};
