import { Writable } from 'stream';

describe('log', () => {
  it('sanitizes log data', () => {
    const brokerTk = (process.env.BROKER_TOKEN = 'BROKER_123');
    const githubTk = (process.env.GITHUB_TOKEN = 'GITHUB_123');
    const gitlabTk = (process.env.GITLAB_TOKEN = 'GITLAB_123');
    const bbUser = (process.env.BITBUCKET_USERNAME = 'BB_USER');
    const bbPass = (process.env.BITBUCKET_PASSWORD = 'BB_PASS');
    const jiraUser = (process.env.JIRA_USERNAME = 'JRA_USER');
    const jiraPass = (process.env.JIRA_PASSWORD = 'JRA_PASS');
    const azureReposToken = (process.env.AZURE_REPOS_TOKEN = 'AZURE_TOKEN');
    const artifactoryUrl = (process.env.ARTIFACTORY_URL =
      'http://basic:auth@artifactory.com');
    const crAgentUrl = (process.env.CR_AGENT_URL = 'CONTAINER_AGENT_URL');
    const crCredentials = (process.env.CR_CREDENTIALS = 'CR_CREDS');
    const crUsername = (process.env.CR_USERNAME = 'CONTAINER_USERNAME');
    const crPassword = (process.env.CR_PASSWORD = 'CONTAINER_PASSWORD');
    const crToken = (process.env.CR_TOKEN = 'CONTAINER_TOKEN');
    const crRoleArn = (process.env.CR_ROLE_ARN = 'CONTAINER_ROLE_ARN');
    const crExternalId = (process.env.CR_EXTERNAL_ID = 'CONTAINER_EXTERNAL_ID');
    const crRegion = (process.env.CR_REGION = 'CONTAINER_REGION');
    const crBase = (process.env.CR_BASE = 'CONTAINER_BASE');
    const gitUsername = (process.env.GIT_USERNAME = 'G_USER');
    const gitPassword = (process.env.GIT_PASSWORD = 'G_PASS');
    const gitClientUrl = (process.env.GIT_CLIENT_URL =
      'http://git-client-url.com');

    const log = require('../../lib/log');

    const sensitiveInfo = [
      brokerTk,
      githubTk,
      gitlabTk,
      azureReposToken,
      bbUser,
      bbPass,
      jiraUser,
      jiraPass,
      artifactoryUrl,
      crAgentUrl,
      crCredentials,
      crUsername,
      crPassword,
      crToken,
      crRoleArn,
      crExternalId,
      crRegion,
      crBase,
      gitUsername,
      gitPassword,
      gitClientUrl,
    ].join();
    const sanitizedTokens =
      '${BROKER_TOKEN},${GITHUB_TOKEN},${GITLAB_TOKEN},${AZURE_REPOS_TOKEN}';
    const sanitizedBitBucket = '${BITBUCKET_USERNAME},${BITBUCKET_PASSWORD}';
    const sanitizedJira = '${JIRA_USERNAME},${JIRA_PASSWORD}';
    const sanitizedArtifactory = '${ARTIFACTORY_URL}';
    const sanitizedCRData =
      '${CR_AGENT_URL},${CR_CREDENTIALS},${CR_USERNAME},${CR_PASSWORD},${CR_TOKEN},${CR_ROLE_ARN},${CR_EXTERNAL_ID},${CR_REGION},${CR_BASE}';
    const sanitizedGitUsername = '${GIT_USERNAME}';
    const sanitizedGitPassword = '${GIT_PASSWORD}';
    const sanitizedGitClientUrl = '${GIT_CLIENT_URL}';

    // setup logger output capturing
    const logs: string[] = [];
    const testStream = new Writable();
    testStream._write = function (chunk, encoding, done) {
      logs.push(chunk.toString());
      done();
    };
    log.addStream({ stream: testStream });

    // try to log sensitive information
    log.info({
      token: sensitiveInfo,
      result: sensitiveInfo,
      origin: sensitiveInfo,
      url: sensitiveInfo,
      httpUrl: sensitiveInfo,
      ioUrl: sensitiveInfo,
    });

    const logged = logs[0];
    expect(logs).toHaveLength(1);

    // assert no sensitive data is logged
    expect(logged).not.toMatch(brokerTk);
    expect(logged).not.toMatch(githubTk);
    expect(logged).not.toMatch(gitlabTk);
    expect(logged).not.toMatch(bbUser);
    expect(logged).not.toMatch(bbPass);
    expect(logged).not.toMatch(jiraUser);
    expect(logged).not.toMatch(jiraPass);
    expect(logged).not.toMatch(azureReposToken);
    expect(logged).not.toMatch(artifactoryUrl);
    expect(logged).not.toMatch(crAgentUrl);
    expect(logged).not.toMatch(crCredentials);
    expect(logged).not.toMatch(crUsername);
    expect(logged).not.toMatch(crPassword);
    expect(logged).not.toMatch(crToken);
    expect(logged).not.toMatch(crRoleArn);
    expect(logged).not.toMatch(crExternalId);
    expect(logged).not.toMatch(crRegion);
    expect(logged).not.toMatch(crBase);
    expect(logged).not.toMatch(gitUsername);
    expect(logged).not.toMatch(gitPassword);
    expect(logged).not.toMatch(gitClientUrl);

    // assert sensitive data is masked
    expect(logged).toMatch(sanitizedBitBucket);
    expect(logged).toMatch(sanitizedTokens);
    expect(logged).toMatch(sanitizedJira);
    expect(logged).toMatch(sanitizedArtifactory);
    expect(logged).toMatch(sanitizedCRData);
    expect(logged).toMatch(sanitizedGitUsername);
    expect(logged).toMatch(sanitizedGitPassword);
    expect(logged).toMatch(sanitizedGitClientUrl);
  });
});
