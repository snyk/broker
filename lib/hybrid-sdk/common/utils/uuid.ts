import { validate, NIL } from 'uuid';

/**
 * Returns true when `value` is a non-nil RFC 4122 UUID string.
 *
 * The nil UUID (all-zeros) is excluded because RFC 4122 defines it as a
 * sentinel meaning "no value", not as an actual identifier.
 */
export const isUUID = (value: unknown): value is string =>
  typeof value === 'string' && validate(value) && value !== NIL;
