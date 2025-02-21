export const determineFilterType = (
  type: string,
  configObject: Record<any, string>,
) => {
  if ('jira' === type && Object.keys(configObject).includes('JIRA_PAT')) {
    return 'jira-bearer-auth';
  }
  if (
    'bitbucket-server' === type &&
    Object.keys(configObject).includes('BITBUCKET_PAT')
  ) {
    return 'bitbucket-server-bearer-auth';
  }
  return type;
};
