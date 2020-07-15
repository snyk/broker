const test = require('tap-only');
const stream = require('stream');

test('log sanitization of sensitive information', (t) => {
  const brokerTk = (process.env.BROKER_TOKEN = 'BROKER_123');
  const githubTk = (process.env.GITHUB_TOKEN = 'GITHUB_123');
  const gitlabTk = (process.env.GITLAB_TOKEN = 'GITLAB_123');
  const bbUser = (process.env.BITBUCKET_USERNAME = 'BB_USER');
  const bbPass = (process.env.BITBUCKET_PASSWORD = 'BB_PASS');
  const jiraUser = (process.env.JIRA_USERNAME = 'JRA_USER');
  const jiraPass = (process.env.JIRA_PASSWORD = 'JRA_PASS');

  const sensitiveInfo = [
    brokerTk,
    githubTk,
    gitlabTk,
    bbUser,
    bbPass,
    jiraUser,
    jiraPass,
  ].join();
  const sanitizedTokens = '${BROKER_TOKEN},${GITHUB_TOKEN},${GITLAB_TOKEN}';
  const sanitizedBitBucket = '${BITBUCKET_USERNAME},${BITBUCKET_PASSWORD}';
  const sanitizedJira = '${JIRA_USERNAME},${JIRA_PASSWORD}';

  const log = require('../../lib/log');

  // setup logger output capturing
  const logs = [];
  const testStream = new stream.Writable();
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
  t.equal(logs.length, 1);

  // assert no sensitive data is logged
  t.notMatch(logged, brokerTk, 'Broker token must be sanitized');
  t.notMatch(logged, githubTk, 'Github token must be sanitized');
  t.notMatch(logged, gitlabTk, 'Gitlab token must be sanitized');
  t.notMatch(logged, bbUser, 'BitBucket username must be sanitized');
  t.notMatch(logged, bbPass, 'BitBucket password must be sanitized');
  t.notMatch(logged, jiraUser, 'JIRA username must be sanitized');
  t.notMatch(logged, jiraPass, 'JIRA password must be sanitized');

  // assert sensitive data is masked
  t.match(logged, sanitizedTokens);
  t.match(logged, sanitizedBitBucket);
  t.match(logged, sanitizedJira);

  t.end();
});
