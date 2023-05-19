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

export type GitHubCreateTreePayload = {
  owner: string;
  repo: string;
  base_tree: string;
  tree: GitHubTree[];
};

export type GitHubTree = {
  content: string;
  mode: '040000' | '100644' | '100755' | '120000' | '160000';
  path: string;
  type: 'blob' | 'commit' | 'tree';
};
