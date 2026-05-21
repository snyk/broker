import { validateWorkloadConfig } from '../../../../../lib/hybrid-sdk/client/checks/config/workloadConfiguration';
import * as configModule from '../../../../../lib/hybrid-sdk/common/config/config';

describe('validateWorkloadConfig — rethrow preservation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => jest.restoreAllMocks());

  // Config with enough _WORKLOAD_ keys to pass the early-return guard and
  // reach the inner verifyClassAndHandler() call where the catch lives.
  const config = {
    REMOTE_WORKLOAD_NAME: 'Foo',
    REMOTE_WORKLOAD_MODULE_PATH: 'remote/foo',
    CLIENT_WORKLOAD_NAME: 'Bar',
    CLIENT_WORKLOAD_MODULE_PATH: 'client/bar',
  } as any;

  it('preserves the original Error instance, message, and code on rethrow', () => {
    const original = new Error('EACCES /factory/root') as Error & {
      code?: string;
    };
    original.code = 'EACCES';
    jest.spyOn(configModule, 'findFactoryRoot').mockImplementation(() => {
      throw original;
    });

    let caught: unknown;
    try {
      validateWorkloadConfig({ id: 'check-wl', name: 'Workload' }, config);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(original);
    expect((caught as Error).message).toContain(
      'Error validating Workload configuration',
    );
    expect((caught as Error).message).toContain('EACCES /factory/root');
    expect((caught as any).code).toBe('EACCES');
  });

  it('wraps a non-Error throwable in an Error, preserving the original via cause', () => {
    const original = 'not an Error instance';
    jest.spyOn(configModule, 'findFactoryRoot').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw original;
    });

    let caught: unknown;
    try {
      validateWorkloadConfig({ id: 'check-wl', name: 'Workload' }, config);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(
      'Error validating Workload configuration',
    );
    expect((caught as Error).message).toContain('not an Error instance');
    expect((caught as Error).cause).toBe(original);
  });
});
