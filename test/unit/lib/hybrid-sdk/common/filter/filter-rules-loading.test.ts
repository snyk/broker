import path from 'path';
import fs from 'fs';
import { log as logger } from '../../../../../../lib/logs/logger';
import { injectRulesAtRuntime } from '../../../../../../lib/hybrid-sdk/common/filter/filter-rules-loading';
import { findProjectRoot } from '../../../../../../lib/hybrid-sdk/common/config/config';

// Absolute paths the source builds at runtime via
// `path.join(findProjectRoot(__dirname), 'defaultFilters/.../github.json')`.
// We need them up-front so jest.doMock(..., { virtual: true }) can serve
// fake module content under that exact key.
const PROJECT_ROOT = findProjectRoot(__dirname) ?? process.cwd();
const APPRISK_RULES_PATH = path.join(
  PROJECT_ROOT,
  'defaultFilters/apprisk/github.json',
);
const CUSTOM_PR_RULES_PATH = path.join(
  PROJECT_ROOT,
  'defaultFilters/customPrTemplates/github.json',
);

function makeFilters() {
  return {
    private: [
      // a benign rule so possibleOverlappingRules.length > 0 when the inject
      // path fires with an empty fixture rule list
      {
        method: 'GET',
        path: '/repos/:owner/:name',
        origin: 'https://{GITHUB_API}',
      },
    ],
    public: [],
  } as any;
}

function makeConfig(overrides: Record<string, any> = {}) {
  return {
    supportedBrokerTypes: ['github'],
    ...overrides,
  } as any;
}

describe('injectRulesAtRuntime — log levels', () => {
  let infoSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    delete process.env.ACCEPT_APPRISK;
    delete process.env.ACCEPT_ESSENTIALS;
    delete process.env.ACCEPT_CUSTOM_PR_TEMPLATES;
    delete process.env.ACCEPT_IAC;
    delete process.env.ACCEPT_CODE;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  it('logs "Injecting Accept rules for AppRisk" at INFO, not DEBUG', () => {
    process.env.ACCEPT_APPRISK = 'true';
    // existsSync returns false → the INFO line at the top of the apprisk
    // block runs before the existsSync check, so we capture it without
    // having to satisfy the require() that follows.
    jest.spyOn(fs, 'existsSync').mockImplementation(() => false);

    injectRulesAtRuntime(makeFilters(), makeConfig(), 'github');

    expect(infoSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Injecting Accept rules for AppRisk',
    );
    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Injecting Accept rules for AppRisk',
    );
  });

  it('logs "Injecting accept rules for custom PR templates." at INFO, not DEBUG', () => {
    process.env.ACCEPT_CUSTOM_PR_TEMPLATES = 'true';
    jest.spyOn(fs, 'existsSync').mockImplementation(() => false);

    injectRulesAtRuntime(makeFilters(), makeConfig(), 'github');

    expect(infoSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Injecting accept rules for custom PR templates.',
    );
    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Injecting accept rules for custom PR templates.',
    );
  });

  it('logs "Caution, possible overlapping rules with apprisk rules extension." at WARN, not DEBUG', () => {
    process.env.ACCEPT_APPRISK = 'true';
    // Only return true for the specific fixture path so findProjectRoot
    // (which uses fs.existsSync to walk for a marker) keeps working.
    const realExistsSync = fs.existsSync;
    jest
      .spyOn(fs, 'existsSync')
      .mockImplementation((p) =>
        typeof p === 'string' && p.includes('apprisk')
          ? true
          : realExistsSync(p),
      );
    jest.doMock(APPRISK_RULES_PATH, () => [], { virtual: true });

    injectRulesAtRuntime(makeFilters(), makeConfig(), 'github');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Caution, possible overlapping rules with apprisk rules extension.',
    );
    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Caution, possible overlapping rules with apprisk rules extension.',
    );
  });

  it('logs "Caution, possible overlapping rules with custom PR templates." at WARN, not DEBUG', () => {
    process.env.ACCEPT_CUSTOM_PR_TEMPLATES = 'true';
    const realExistsSync = fs.existsSync;
    jest
      .spyOn(fs, 'existsSync')
      .mockImplementation((p) =>
        typeof p === 'string' && p.includes('customPrTemplates')
          ? true
          : realExistsSync(p),
      );
    jest.doMock(CUSTOM_PR_RULES_PATH, () => [], { virtual: true });

    injectRulesAtRuntime(makeFilters(), makeConfig(), 'github');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Caution, possible overlapping rules with custom PR templates.',
    );
    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Caution, possible overlapping rules with custom PR templates.',
    );
  });
});
