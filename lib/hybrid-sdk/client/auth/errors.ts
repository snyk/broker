/**
 * Thrown when auth renewal returns a non-2XX status.
 */
export class AuthRenewalError extends Error {
  constructor(public readonly statusCode: number) {
    super(`Auth renewal failed with status ${statusCode}`);
    Object.setPrototypeOf(this, AuthRenewalError.prototype);
  }
}
