export class PgpPrivateKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PgpPrivateKeyValidationError.prototype);
  }
}
