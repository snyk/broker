import { serialiseError } from '../../lib/logs/logger';

// Test-local helper: serialiseError returns `undefined` for non-Error
// input. Tests below pass real Errors and want a non-null result; this
// asserts that and narrows the type.
function serialise(error: Error): Record<string, unknown> {
  const out = serialiseError(error);
  expect(out).toBeDefined();
  return out as Record<string, unknown>;
}

describe('serialiseError', () => {
  it('returns undefined for non-Error input', () => {
    expect(serialiseError('not an Error')).toBeUndefined();
    expect(serialiseError(null)).toBeUndefined();
    expect(serialiseError({ message: 'plain object' })).toBeUndefined();
  });

  it('serialises a plain Error to {name, message, stack}', () => {
    const out = serialise(new Error('boom'));

    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(out.stack).toContain('Error: boom');
  });

  it('copies enumerable own properties (e.g. code) onto the result', () => {
    const err = new Error('boom') as Error & { code?: string };
    err.code = 'EBOOM';

    expect(serialise(err).code).toBe('EBOOM');
  });

  it('renders a primitive-string cause inline', () => {
    const out = serialise(
      new Error('wrapper', { cause: 'original-string-cause' }),
    );

    expect(out.message).toBe('wrapper');
    expect(out.cause).toBe('original-string-cause');
  });

  it('renders an object cause as the object', () => {
    const cause = { code: 'X', detail: 'payload' };
    const out = serialise(new Error('wrapper', { cause }));

    expect(out.cause).toEqual(cause);
  });

  it('renders a null cause as null (not dropped)', () => {
    const out = serialise(new Error('wrapper', { cause: null }));

    expect(out.cause).toBeNull();
  });

  it('does not crash on a circular cause (bunyan stringifies cycles to [Circular])', () => {
    const circular: any = { id: 1 };
    circular.self = circular;

    expect(() =>
      serialise(new Error('wrapper', { cause: circular })),
    ).not.toThrow();
  });
});
