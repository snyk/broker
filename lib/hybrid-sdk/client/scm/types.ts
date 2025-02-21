/**
 * Accept filter rule for SCM.
 * With '//' element we document a purpose of the particular rule.
 */
export type FilterRule = {
  '//': string;
  method: string;
  path: string;
  origin: string;
};
