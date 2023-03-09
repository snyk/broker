import { Check } from '../../lib/client/checks/types';

export const aCheck = (fields: Partial<Check>): Check => {
  const id = `check_${Date.now()}`;
  return {
    checkId: id,
    checkName: id,
    url: 'http://localhost:8080/check-url',
    timeoutMs: 500,
    ...fields,
  };
};
