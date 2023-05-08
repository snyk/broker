export class GitHubCommitParsingError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GitHubCommitParsingError.prototype);
  }
}
