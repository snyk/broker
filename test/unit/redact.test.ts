import {
  CREDENTIAL_ENV_VARS,
  CREDENTIAL_KEY_PATTERN,
  REDACTED,
  redactConfig,
} from '../../lib/logs/redact';

describe('redactConfig', () => {
  it('returns primitives and null/undefined unchanged', () => {
    expect(redactConfig(undefined)).toBeUndefined();
    expect(redactConfig(null)).toBeNull();
    expect(redactConfig('hello')).toBe('hello');
    expect(redactConfig(42)).toBe(42);
    expect(redactConfig(true)).toBe(true);
  });

  it('does not mutate the input', () => {
    const input = { CR_PASSWORD: 'secret', friendlyName: 'cr-1' };
    const out = redactConfig(input) as Record<string, unknown>;
    expect(input.CR_PASSWORD).toBe('secret');
    expect(out.CR_PASSWORD).toBe(REDACTED);
  });

  it('redacts every known credential env-var name', () => {
    for (const name of CREDENTIAL_ENV_VARS) {
      const out = redactConfig({ [name]: 'sensitive-value' }) as Record<
        string,
        unknown
      >;
      expect(out[name]).toBe(REDACTED);
    }
  });

  it('preserves non-secret keys', () => {
    const out = redactConfig({
      friendlyName: 'gh-1',
      type: 'github',
      BROKER_TYPE: 'client',
      CR_PASSWORD: 'p',
    }) as Record<string, unknown>;
    expect(out).toEqual({
      friendlyName: 'gh-1',
      type: 'github',
      BROKER_TYPE: 'client',
      CR_PASSWORD: REDACTED,
    });
  });

  it('redacts keys that match the credential pattern even when not enumerated', () => {
    expect(CREDENTIAL_KEY_PATTERN.test('SOME_CUSTOM_TOKEN')).toBe(true);
    const out = redactConfig({
      SOME_CUSTOM_TOKEN: 'x',
      my_secret: 'y',
      anyPassword: 'z',
      contains_passphrase_inside: 'w',
      authorization: 'Bearer ...',
      private_key: 'k',
      somePEMfield: 'p',
      benign: 'ok',
    }) as Record<string, unknown>;
    expect(out.SOME_CUSTOM_TOKEN).toBe(REDACTED);
    expect(out.my_secret).toBe(REDACTED);
    expect(out.anyPassword).toBe(REDACTED);
    expect(out.contains_passphrase_inside).toBe(REDACTED);
    expect(out.authorization).toBe(REDACTED);
    expect(out.private_key).toBe(REDACTED);
    expect(out.somePEMfield).toBe(REDACTED);
    expect(out.benign).toBe('ok');
  });

  it('recurses into nested objects', () => {
    const out = redactConfig({
      friendlyName: 'cr-1',
      nested: {
        CR_PASSWORD: 'p',
        deeper: { CR_TOKEN: 't', label: 'keep-me' },
      },
    }) as any;
    expect(out.nested.CR_PASSWORD).toBe(REDACTED);
    expect(out.nested.deeper.CR_TOKEN).toBe(REDACTED);
    expect(out.nested.deeper.label).toBe('keep-me');
  });

  it('walks arrays', () => {
    const out = redactConfig([
      { CR_PASSWORD: 'a', name: 'one' },
      { CR_PASSWORD: 'b', name: 'two' },
    ]) as any[];
    expect(out[0].CR_PASSWORD).toBe(REDACTED);
    expect(out[0].name).toBe('one');
    expect(out[1].CR_PASSWORD).toBe(REDACTED);
    expect(out[1].name).toBe('two');
  });

  it('preserves falsy values under secret keys so support can distinguish "not set" from "redacted real value"', () => {
    const out = redactConfig({
      CR_PASSWORD: null,
      CR_TOKEN: undefined,
      GITHUB_TOKEN: '',
      GHA_ACCESS_TOKEN_BOOL: false,
      JWT_TOKEN_NUM: 0,
    }) as Record<string, unknown>;
    expect(out.CR_PASSWORD).toBeNull();
    expect(out.CR_TOKEN).toBeUndefined();
    expect(out.GITHUB_TOKEN).toBe('');
    expect(out.GHA_ACCESS_TOKEN_BOOL).toBe(false);
    expect(out.JWT_TOKEN_NUM).toBe(0);
  });

  it('does NOT redact GitHub App identifiers — they are diagnostic, not sensitive', () => {
    const out = redactConfig({
      GITHUB_APP_ID: '12345',
      GITHUB_APP_INSTALLATION_ID: '67890',
      GITHUB_APP_PRIVATE_PEM_PATH: '/etc/secrets/app.pem',
    }) as Record<string, unknown>;
    expect(out.GITHUB_APP_ID).toBe('12345');
    expect(out.GITHUB_APP_INSTALLATION_ID).toBe('67890');
    expect(out.GITHUB_APP_PRIVATE_PEM_PATH).toBe(REDACTED);
  });

  it('handles circular references safely', () => {
    const input: any = { friendlyName: 'gh-1', CR_PASSWORD: 'p' };
    input.self = input;
    const out = redactConfig(input) as any;
    expect(out.friendlyName).toBe('gh-1');
    expect(out.CR_PASSWORD).toBe(REDACTED);
    expect(out.self).toBe('[Circular]');
  });

  it('honours custom toJSON on class instances (matches JSON.stringify semantics)', () => {
    class Connection {
      friendlyName = 'cr-1';
      CR_PASSWORD = 'leak-me-not';
      private secret = 'private-field';
      toJSON() {
        return {
          friendlyName: this.friendlyName,
          CR_PASSWORD: this.CR_PASSWORD,
          derived: `secret-length-${this.secret.length}`,
        };
      }
    }
    const out = redactConfig(new Connection()) as Record<string, unknown>;
    expect(out.friendlyName).toBe('cr-1');
    expect(out.CR_PASSWORD).toBe(REDACTED);
    expect(out.derived).toBe('secret-length-13');
  });
});
