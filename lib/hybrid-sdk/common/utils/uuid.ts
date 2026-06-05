import { randomUUID } from 'node:crypto';

/** The nil UUID (all-zeros) as a sentinel meaning "no value". */
export const NIL = '00000000-0000-0000-0000-000000000000';

const UUID_REGEX =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;

/** Generates a random version 4 UUID. */
export const uuidv4 = (): string => randomUUID();

/** Returns true when `value` is a valid UUID string (versions 1-5 or nil). */
export const validate = (value: unknown): boolean =>
  typeof value === 'string' && UUID_REGEX.test(value);

/**
 * Returns true when `value` is a non-nil RFC 4122 UUID string.
 *
 * The nil UUID (all-zeros) is excluded because RFC 4122 defines it as a
 * sentinel meaning "no value", not as an actual identifier.
 */
export const isUUID = (value: unknown): value is string =>
  validate(value) && value !== NIL;
