import { Check } from '../../../../lib/client/checks/types';
import { PreflightCheckStore } from '../../../../lib/client/checks/prefilght-check-store';

let preflightCheckStore: PreflightCheckStore;

describe('preflight-check-store', () => {
  beforeEach(() => {
    preflightCheckStore = new PreflightCheckStore();
  });

  it('returns all preflight checks', async () => {
    const checkOne: Check = {
      checkId: 'check-one',
      checkName: 'check one',
      url: 'https://some-url',
      timeoutMs: 10,
    };
    await preflightCheckStore.add(checkOne);
    const checkTwo: Check = {
      checkId: 'check-two',
      checkName: 'check two',
      url: 'https://some-url',
      timeoutMs: 10,
    };
    await preflightCheckStore.add(checkTwo);

    const foundChecks = await preflightCheckStore.getAll();

    expect(foundChecks.length).toEqual(2);
    expect(foundChecks[0]).toStrictEqual(checkOne);
    expect(foundChecks[1]).toStrictEqual(checkTwo);
  });

  it('returns the preflight check by checkId', async () => {
    const check: Check = {
      checkId: 'check-one',
      checkName: 'check one',
      url: 'https://some-url',
      timeoutMs: 1_000,
    };
    await preflightCheckStore.add(check);

    const foundCheck = await preflightCheckStore.get('check-one');

    expect(foundCheck).not.toBeNull();
    expect(foundCheck?.checkId).toBe('check-one');
  });

  it('returns null if no check found', async () => {
    const check: Check = {
      checkId: 'check-random',
      checkName: 'check random',
      url: 'https://some-random-url',
      timeoutMs: 10,
    };
    await preflightCheckStore.add(check);

    const foundCheck = await preflightCheckStore.get('non-existing-checkId');

    expect(foundCheck).toBeNull();
  });

  it('adds only unique preflight checks', async () => {
    const check: Check = {
      checkId: 'unique-check',
      checkName: 'unique-check',
      url: 'https://some-unique-url',
      timeoutMs: 100,
    };
    await preflightCheckStore.add(check);
    await preflightCheckStore.add(check);

    const foundChecks = await preflightCheckStore.getAll();

    expect(foundChecks.length).toEqual(1);
    expect(foundChecks[0]).toStrictEqual(check);
  });
});
