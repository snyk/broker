export type GitHubCommitPayload = {
  message: string;
  tree: string;
  parents: string[];
  author: GitUser;
  committer: GitUser;
  signature?: string;
};

export type GitUser = {
  name: string;
  email: string;
  date: Date;
};
