export class GitHubCommitParsingError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GitHubCommitParsingError.prototype);
  }
}

export class GitHubTreeParsingError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GitHubTreeParsingError.prototype);
  }
}

export class GitHubTreeValidationError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GitHubTreeValidationError.prototype);
  }
}
