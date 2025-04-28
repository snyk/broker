[![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)](https://snyk.io)

[![Known Vulnerabilities](https://snyk.io/test/github/snyk/broker/badge.svg?style=flat-square)](https://snyk.io/test/github/snyk/broker)

***

# snyk/broker

Snyk Broker proxies access between snyk.io and your Git repositories, such as GitHub Enterprise, GitHub.com and Bitbucket Server. Snyk Broker can also be used to enable a secure connection with your on-premise Jira deployment.

The Broker server and client establish an applicative tunnel, proxying requests from snyk.io to the Git (fetching manifest files from monitored repositories), and vice versa (webhooks posted by the Git).

The Broker client runs within the user's internal network, keeping sensitive data such as Git tokens within the network perimeter. The applicative tunnel scans and adds only relevant requests to an approved list, narrowing down the access permissions to the bare minimum required for Snyk to actively monitor a repository.

## Usage

Please refer to our [extensive documentation](https://docs.snyk.io/enterprise-setup/snyk-broker).
