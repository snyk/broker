process.env.SNYK_BROKER_BOOT_MODE = 'universal';
process.env.SERVICE_ENV = 'universal';
process.env.SNYK_BROKER_TYPES = 'testtype';
process.env.SNYK_SOURCE_TYPES__testtype__publicId =
  '9a3e5d90-b782-468a-a042-9a2073736f00';

import { Writable } from 'stream';

describe('log', () => {
  it('sanitizes log data', () => {
    const brokerTk = (process.env.SNYK_BROKER_TOKEN = 'BROKER_123');
    const githubTk = (process.env.SNYK_GITHUB__GITHUB_TOKEN = 'GITHUB_123');
    const githubTkPool = [
      (process.env.SNYK_GITHUB__GITHUB_TOKEN_POOL = 'GITHUB_456,GITHUB_789'),
    ];
    const gitlabTk = (process.env.SNYK_GITLAB__GITLAB_TOKEN = 'GITLAB_123');
    const bbUser = (process.env['SNYK_BITBUCKET-SERVER__BITBUCKET_USERNAME'] =
      'BB_USER');
    const bbPass = (process.env['SNYK_BITBUCKET-SERVER__BITBUCKET_PASSWORD'] =
      'BB_PASS');
    const jiraUser = (process.env.SNYK_JIRA__JIRA_USERNAME = 'JRA_USER');
    const jiraPass = (process.env.SNYK_JIRA__JIRA_PASSWORD = 'JRA_PASS');
    const jiraPassPool = [
      (process.env.SNYK_JIRA__JIRA_PASSWORD_POOL = 'JRA_POOL_PASS'),
    ];
    const azureReposToken = (process.env[
      'SNYK_AZURE-REPOS__AZURE_REPOS_TOKEN'
    ] = 'AZURE_TOKEN');
    const artifactoryUrl = (process.env.SNYK_ARTIFACTORY__ARTIFACTORY_URL =
      'http://basic:auth@artifactory.com');
    const nexusUrl = (process.env.SNYK_NEXUS__BASE_NEXUS_URL =
      'http://basic:auth@nexus.com');
    const crAgentUrl = (process.env['SNYK_CR-AGENT__CR_AGENT_URL'] =
      'CONTAINER_AGENT_URL');
    const crCredentials = (process.env['SNYK_CR-AGENT__CR_CREDENTIALS'] =
      'CR_CREDS');
    const crUsername = (process.env['SNYK_CR-AGENT__CR_USERNAME'] =
      'CONTAINER_USERNAME');
    const crPassword = (process.env['SNYK_CR-AGENT__CR_PASSWORD'] =
      'CONTAINER_PASSWORD');
    const crToken = (process.env['SNYK_CR-AGENT__CR_TOKEN'] =
      'CONTAINER_TOKEN');
    const crRoleArn = (process.env['SNYK_CR-AGENT__CR_ROLE_ARN'] =
      'CONTAINER_ROLE_ARN');
    const crExternalId = (process.env['SNYK_CR-AGENT__CR_EXTERNAL_ID'] =
      'CONTAINER_EXTERNAL_ID');
    const crRegion = (process.env['SNYK_CR-AGENT__CR_REGION'] =
      'CONTAINER_REGION');
    const crBase = (process.env['SNYK_CR-AGENT__CR_BASE'] = 'CONTAINER_BASE');
    const gitUsername = (process.env.SNYK_GIT_USERNAME = 'G_USER');
    const gitPassword = (process.env.SNYK_GIT_PASSWORD = 'G_PASS');
    const gitClientUrl = (process.env.SNYK_GIT_CLIENT_URL =
      'http://git-client-url.com');

    const log = require('../../lib/log');

    const sensitiveInfo = [
      brokerTk,
      githubTk,
      githubTkPool[0],
      gitlabTk,
      azureReposToken,
      bbUser,
      bbPass,
      jiraUser,
      jiraPass,
      jiraPassPool,
      artifactoryUrl,
      nexusUrl,
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
      '${BROKER_TOKEN},${GITHUB_TOKEN},${GITHUB_TOKEN_POOL},${GITLAB_TOKEN},${AZURE_REPOS_TOKEN}';
    const sanitizedBitBucket = '${BITBUCKET_USERNAME},${BITBUCKET_PASSWORD}';
    const sanitizedJira =
      '${JIRA_USERNAME},${JIRA_PASSWORD},${JIRA_PASSWORD_POOL}';
    const sanitizedArtifactory = '${ARTIFACTORY_URL}';
    const sanitizedNexus = '${BASE_NEXUS_URL}';
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
    expect(logged).not.toMatch(githubTkPool[0]);
    expect(logged).not.toMatch(gitlabTk);
    expect(logged).not.toMatch(bbUser);
    expect(logged).not.toMatch(bbPass);
    expect(logged).not.toMatch(jiraUser);
    expect(logged).not.toMatch(jiraPass);
    expect(logged).not.toMatch(jiraPassPool[0]);
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
    expect(logged).toMatch(sanitizedNexus);
    expect(logged).toMatch(sanitizedCRData);
    expect(logged).toMatch(sanitizedGitUsername);
    expect(logged).toMatch(sanitizedGitPassword);
    expect(logged).toMatch(sanitizedGitClientUrl);
  });
});
