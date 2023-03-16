import { PreflightCheckStore } from '../../../../lib/client/checks/preflight-check-store';
import { aCheck } from '../../../helpers/test-factories';

let preflightCheckStore: PreflightCheckStore;

describe('preflight-check-store', () => {
  beforeEach(() => {
    preflightCheckStore = new PreflightCheckStore();
  });

  it('returns all preflight checks', async () => {
    const checkOne = aCheck({ checkId: 'check-one', checkName: 'check-one' });
    const checkTwo = aCheck({ checkId: 'check-two', checkName: 'check-two' });
    await preflightCheckStore.add(checkOne);
    await preflightCheckStore.add(checkTwo);

    const foundChecks = await preflightCheckStore.getAll();

    expect(foundChecks.length).toEqual(2);
    expect(foundChecks[0]).toStrictEqual(checkOne);
    expect(foundChecks[1]).toStrictEqual(checkTwo);
  });

  it('returns only active preflight checks', async () => {
    const checkActive = aCheck({ checkId: 'check-active' });
    const checkNotActive = aCheck({
      checkId: 'check-not-active',
      active: false,
    });
    await preflightCheckStore.add(checkActive);
    await preflightCheckStore.add(checkNotActive);

    const foundChecks = await preflightCheckStore.getAll();

    expect(foundChecks.length).toEqual(1);
    expect(foundChecks[0]).toStrictEqual(checkActive);
  });

  it('returns the preflight check by checkId', async () => {
    const check = aCheck({ checkId: 'check-one', checkName: 'check-one' });
    await preflightCheckStore.add(check);

    const foundCheck = await preflightCheckStore.get('check-one');

    expect(foundCheck).not.toBeNull();
    expect(foundCheck?.checkId).toBe('check-one');
  });

  it('returns null for inactive check by checkId', async () => {
    const checkNotActive = aCheck({
      checkId: 'check-not-active',
      active: false,
    });
    await preflightCheckStore.add(checkNotActive);

    const foundCheck = await preflightCheckStore.get('check-not-active');

    expect(foundCheck).toBeNull();
  });

  it('returns null if no check found', async () => {
    const check = aCheck({
      checkId: 'check-random',
      checkName: 'check-random',
    });
    await preflightCheckStore.add(check);

    const foundCheck = await preflightCheckStore.get('non-existing-checkId');

    expect(foundCheck).toBeNull();
  });

  it('adds only unique preflight checks', async () => {
    const check = aCheck({
      checkId: 'unique-check',
      checkName: 'unique-check',
    });
    await preflightCheckStore.add(check);
    await preflightCheckStore.add(check);

    const foundChecks = await preflightCheckStore.getAll();

    expect(foundChecks.length).toEqual(1);
    expect(foundChecks[0]).toStrictEqual(check);
  });
});
