[![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)](https://snyk.io)

[![Known Vulnerabilities](https://snyk.io/test/npm/snyk-broker/badge.svg?style=flat-square)](https://snyk.io/test/npm/snyk-broker)

***

# snyk/broker

Snyk broker proxies access between snyk.io and source-code management systems (SCMs) such as GitHub Enterprise, GitHub.com and Bitbucket Server.

The broker server and client establish an applicative tunnel, proxying requests from snyk.io to the SCM (fetching manifest files from monitored repositories), and vice versa (webhooks posted by the SCM).

The broker client runs within the user's internal network, keeping sensitive data such as SCM tokens within the network perimeter. The applicative tunnel scans and whitelists only relevant requests, narrowing down the access permissions to the bare minimum required for Snyk to actively monitor a repository.

## Usage

The broker client is published as a set of docker images, each configured for a specific SCM. Custom configuration is provided as environment variables.

### GitHub.com

To use the the broker client with GitHub.com, pull the `snyk/broker:github-com` tag. The following environment variables are needed to customize the broker client:

- `BROKER_TOKEN` - the snyk broker token, obtained from your snyk org settings view.
- `GITHUB_TOKEN` - a personal access token with full `repo` and `admin:repo_hook` scopes.
- `PORT` - the local port at which the broker client accepts connections. Default is 7341.
- `BROKER_CLIENT_URL` - the full URL of the broker client as it will be accessible by GitHub.com webhooks, such as `http://my.broker.client:7341`

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```
docker run -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITHUB_TOKEN=secret-github-token \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000
           snyk/broker:github-com
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```
FROM snyk/broker:github-com

ENV BROKER_TOKEN      secret-broker-token
ENV GITHUB_TOKEN      secret-github-token
ENV PORT              8000
ENV BROKER_CLIENT_URL http://my.broker.client:8000
```

### GitHub Enterprise

To use the the broker client with a GitHub Enterprise deployment, pull the `snyk/broker:github-enterprise` tag. The following environment variables are needed to customize the broker client:

- `BROKER_TOKEN` - the snyk broker token, obtained from your snyk org settings view.
- `GITHUB_TOKEN` - a personal access token with full `repo` and `admin:repo_hook` scopes.
- `GITHUB` - the hostname of your GitHub Enterprise deployment, such as `your.ghe.domain.com`.
- `GITHUB_API` - the API endpoint of your GitHub Enterprise deployment. Should be `$GITHUB/api/v3`.
- `GITHUB_RAW` - the raw file access endpoint of your GitHub Enterprise deployment. Should be `$GITHUB/raw`.
- `PORT` - the local port at which the broker client accepts connections. Default is 7341.
- `BROKER_CLIENT_URL` - the full URL of the broker client as it will be accessible by your GitHub Enterprise deployment webhooks, such as `http://my.broker.client:7341`

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```
docker run -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITHUB_TOKEN=secret-github-token \
           -e GITHUB=your.ghe.domain.com \
           -e GITHUB_API=your.ghe.domain.com/api/v3 \
           -e GITHUB_RAW=your.ghe.domain.com/raw \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000
       snyk/broker:github-enterprise
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```
FROM snyk/broker:github-enterprise

ENV BROKER_TOKEN      secret-broker-token
ENV GITHUB_TOKEN      secret-github-token
ENV GITHUB            your.ghe.domain.com
ENV GITHUB_API        your.ghe.domain.com/api/v3
ENV GITHUB_RAW        your.ghe.domain.com/raw
ENV PORT              8000
ENV BROKER_CLIENT_URL http://my.broker.client:8000
```

### Bitbucket Server

To use the the broker client with a Bitbucket Server deployment, pull the `snyk/broker:bitbucket-server` tag. The following environment variables are needed to customize the broker client:

- `BROKER_TOKEN` - the snyk broker token, obtained from your Bitbucket Server integration settings view.
- `BITBUCKET_USERNAME` - the Bitbucket Server username.
- `BITBUCKET_PASSWORD` - the Bitbucket Server password.
- `BITBUCKET` - the hostname of your Bitbucket Server deployment, such as `your.bitbucket-server.domain.com`.
- `BITBUCKET_API` - the API endpoint of your Bitbucket Server deployment. Should be `$BITBUCKET/rest/api/1.0`.
- `PORT` - the local port at which the broker client accepts connections. Default is 7341.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```
docker run -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e BITBUCKET_USERNAME=username \
           -e BITBUCKET_PASSWORD=password \
           -e BITBUCKET=your.bitbucket-server.domain.com \
           -e BITBUCKET_API=your.bitbucket-server.domain.com/rest/api/1.0 \
           -e PORT=8000 \
       snyk/broker:bitbucket-server
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```
FROM snyk/broker:bitbucket-server

ENV BROKER_TOKEN        secret-broker-token
ENV BITBUCKET_USERNAME  username
ENV BITBUCKET_PASSWORD  password
ENV BITBUCKET           your.bitbucket-server.domain.com
ENV BITBUCKET_API       your.bitbucket-server.domain.com/rest/api/1.0
ENV PORT                8000
```

* [License: Apache License, Version 2.0](https://github.com/snyk/broker/blob/master/LICENSE)
* [Contributing](https://github.com/snyk/broker/blob/master/.github/CONTRIBUTING.md)
* [Security](https://github.com/snyk/broker/blob/master/SECURITY.md)
