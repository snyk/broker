import { Check, CheckId } from './types';

export interface CheckStore {
  add(check: Check): Promise<void>;

  get(checkId: CheckId): Promise<Check | null>;

  getAll(): Promise<Check[]>;
}
