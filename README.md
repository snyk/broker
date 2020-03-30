[![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)](https://snyk.io)

[![Known Vulnerabilities](https://snyk.io/test/github/snyk/broker/badge.svg?style=flat-square)](https://snyk.io/test/github/snyk/broker)

***

# snyk/broker

Snyk Broker proxies access between snyk.io and your Git repositories, such as GitHub Enterprise, GitHub.com and Bitbucket Server. Snyk Broker can also be used to enable a secure connection with your on-premise Jira deployment.

The Broker server and client establish an applicative tunnel, proxying requests from snyk.io to the Git (fetching manifest files from monitored repositories), and vice versa (webhooks posted by the Git).

The Broker client runs within the user's internal network, keeping sensitive data such as Git tokens within the network perimeter. The applicative tunnel scans and adds only relevant requests to an approved list, narrowing down the access permissions to the bare minimum required for Snyk to actively monitor a repository.

## Usage

The Broker client is published as a set of Docker images, each configured for a specific Git. Standard and custom configuration is performed with environment variables as described below, per integration type.

### GitHub.com

To use the the Broker client with GitHub.com, run `docker pull snyk/broker:github-com`. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - the Snyk Broker token, obtained from your Snyk Org settings view (app.snyk.io).
- `GITHUB_TOKEN` - a personal access token with full `repo`, `read:org` and `admin:repo_hook` scopes.
- `PORT` - the local port at which the Broker client accepts connections. Default is 7341.
- `BROKER_CLIENT_URL` - the full URL of the Broker client as it will be accessible by GitHub.com webhooks, such as `http://my.broker.client:7341`

#### Command-line arguments

You can run the Docker container by providing the relevant configuration:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITHUB_TOKEN=secret-github-token \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
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

To use the the Broker client with a GitHub Enterprise deployment, run `docker pull snyk/broker:github-enterprise` tag. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - the Snyk Broker token, obtained from your Snyk Org settings view (app.snyk.io).
- `GITHUB_TOKEN` - a personal access token with full `repo`, `read:org` and `admin:repo_hook` scopes.
- `GITHUB` - the hostname of your GitHub Enterprise deployment, such as `your.ghe.domain.com`.
- `GITHUB_API` - the API endpoint of your GitHub Enterprise deployment. Should be `your.ghe.domain.com/api/v3`.
- `GITHUB_GRAPHQL` - the graphql endpoint of your GitHub Enterprise deployment. Should be `your.ghe.domain.com/api`.
- `PORT` - the local port at which the Broker client accepts connections. Default is 7341.
- `BROKER_CLIENT_URL` - the full URL of the Broker client as it will be accessible by your GitHub Enterprise deployment webhooks, such as `http://my.broker.client:7341`

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITHUB_TOKEN=secret-github-token \
           -e GITHUB=your.ghe.domain.com \
           -e GITHUB_API=your.ghe.domain.com/api/v3 \
           -e GITHUB_GRAPHQL=your.ghe.domain.com/api \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
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
ENV GITHUB_GRAPHQL    your.ghe.domain.com/api
ENV PORT              8000
ENV BROKER_CLIENT_URL http://my.broker.client:8000
```

### Bitbucket Server

To use the the Broker client with a Bitbucket Server deployment, run `docker pull snyk/broker:bitbucket-server` tag. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - the snyk broker token, obtained from your Bitbucket Server integration settings view (app.snyk.io).
- `BITBUCKET_USERNAME` - the Bitbucket Server username.
- `BITBUCKET_PASSWORD` - the Bitbucket Server password.
- `BITBUCKET` - the hostname of your Bitbucket Server deployment, such as `your.bitbucket-server.domain.com`.
- `BITBUCKET_API` - the API endpoint of your Bitbucket Server deployment. Should be `$BITBUCKET/rest/api/1.0`.
- `BROKER_CLIENT_URL` - the full URL of the broker client as it will be accessible by your Bitbucket Server for webhooks, such as `http://my.broker.client:7341`
- `PORT` - the local port at which the broker client accepts connections. Default is 7341.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e BITBUCKET_USERNAME=username \
           -e BITBUCKET_PASSWORD=password \
           -e BITBUCKET=your.bitbucket-server.domain.com \
           -e BITBUCKET_API=your.bitbucket-server.domain.com/rest/api/1.0 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
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

### Artifactory Container Registry

To use the the broker client with an Artifactory Container Registry deployment, run `docker pull snyk/broker:artifactory-cr` tag. The following environment variables are needed to customize the broker client:

- `BROKER_TOKEN` - the snyk broker token, obtained from your Artifactory CR integration settings view.
- `ARTIFACTORYCR_USERNAME` - the Artifactory CR username.
- `ARTIFACTORYCR_PASSWORD` - the Artifactory CR password.
- `ARTIFACTORYCR_HOSTNAME` - the hostname of your Artifactory CR deployment, such as `your.artifactory.domain.com`.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e ARTIFACTORYCR_USERNAME=username \
           -e ARTIFACTORYCR_PASSWORD=password \
           -e ARTIFACTORYCR_HOSTNAME=your.artifactory-server.domain.com \
       snyk/broker:artifactory-cr
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```
FROM snyk/broker:artifactory-cr

ENV BROKER_TOKEN            secret-broker-token
ENV ARTIFACTORYCR_USERNAME  username
ENV ARTIFACTORYCR_PASSWORD  password
ENV ARTIFACTORYCR_HOSTNAME  your.artifactory.domain.com
```

### GitLab

To use the the Broker client with GitLab.com or an on-prem GitLab deployment, run `docker pull snyk/broker:gitlab` tag. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - the Snyk Broker token, obtained from your GitLab integration settings view (app.snyk.io).
- `GITLAB_TOKEN` - a GitLab personal access token with `api` scope
- `GITLAB` - the hostname of your GitLab deployment, such as `your.gitlab.domain.com` or `GitLab.com`.
- `PORT` - the local port at which the Broker client accepts connections. Default is 7341.
- `BROKER_CLIENT_URL` - the full URL of the Broker client as it will be accessible by GitLab.com webhooks, such as `http://my.broker.client:7341`

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITLAB_TOKEN=secret-gitlab-token \
           -e GITLAB=your.gitlab.domain.com \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e PORT=8000 \
       snyk/broker:gitlab
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```
FROM snyk/broker:gitlab

ENV BROKER_TOKEN        secret-broker-token
ENV GITLAB_TOKEN        secret-gitlab-token
ENV GITLAB              your.gitlab.domain.com
ENV BROKER_CLIENT_URL   http://my.broker.client:8000
ENV PORT                8000
```

### Jira

To use the the Broker client with a Jira deployment, run `docker pull snyk/broker:jira` tag. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - the Snyk Broker token, obtained from your Jira integration settings view.
- `JIRA_USERNAME` - the Jira username.
- `JIRA_PASSWORD` - the Jira password.
- `JIRA_HOSTNAME` - the hostname of your Jira deployment, such as `your.jira.domain.com`.
- `BROKER_CLIENT_URL` - the full URL of the Broker client as it will be accessible by your Jira for webhooks, such as `http://my.broker.client:7341`
- `PORT` - the local port at which the Broker client accepts connections. Default is 7341.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e JIRA_USERNAME=username \
           -e JIRA_PASSWORD=password \
           -e JIRA_HOSTNAME=your.jira.domain.com \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e PORT=8000 \
       snyk/broker:jira
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```
FROM snyk/broker:jira

ENV BROKER_TOKEN        secret-broker-token
ENV JIRA_USERNAME       username
ENV JIRA_PASSWORD       password
ENV JIRA_HOSTNAME       your.jira.domain.com
ENV PORT                8000
```

### Monitoring

#### Healthcheck

The Broker exposes an endpoint at `/healthcheck`, which can be used to monitor the health of the running application. This endpoint responds with status code `200 OK` when the internal request is successful, and returns `{ ok: true }` in the response body.

In the case of the Broker client, this endpoint also reports on the status of the Broker websocket connection.  If the websocket connection is not open, this endpoint responds with status code `500 Internal Server Error` and `{ ok: false }` in the response body.

To change the location of the healthcheck endpoint, you can specify an alternative path via an environment variable:

```
ENV BROKER_HEALTHCHECK_PATH /path/to/healthcheck
```

#### Systemcheck

The Broker client exposes an endpoint at `/systemcheck`, which can be used to validate the brokered service (Git or the like) connectivity and credentials. This endpoint causes the Broker client to make a request to a preconfigured URL, and report on the success of the request. The supported configuration is:

* `BROKER_CLIENT_VALIDATION_URL` - the URL to which the request will be made.
* `BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER` - [optional] the `Authorization` header value of the request. Mutually exclusive with `BROKER_CLIENT_VALIDATION_BASIC_AUTH`.
* `BROKER_CLIENT_VALIDATION_BASIC_AUTH` - [optional] the basic auth credentials (`username:password`) to be base64 encoded and placed in the `Authorization` header value of the request. Mutually exclusive with `BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER`.
* `BROKER_CLIENT_VALIDATION_METHOD` - [optional] the HTTP method of the request (default is `GET`).
* `BROKER_CLIENT_VALIDATION_TIMEOUT_MS` - [optional] the request timeout in milliseconds (default is 5000 ms).

This endpoint responds with status code `200 OK` when the internal request is successful, and returns `{ ok: true }` in the response body. If the internal request fails, this endpoint responds with status code `500 Internal Server Error` and `{ ok: false }` in the response body.

To change the location of the systemcheck endpoint, you can specify an alternative path via an environment variable:

```
ENV BROKER_SYSTEMCHECK_PATH /path/to/systemcheck
```

#### Logging

By default the log level of the Broker is set to INFO. All SCM responses regardless of HTTP status code will be logged by the Broker client. The following settings can be set in your environment variables to alter the logging behaviour:

| Key  | Default | Notes |
|---|---|---|
| LOG_LEVEL | info | Set to "debug" for all logs |
| LOG_ENABLE_BODY | false | Set to "true" to include the response body in the Client logs |

### Advanced Configuration

#### HTTPS

The Broker client runs an HTTP server by default. It can be configured to run an HTTPS server for local connections. This requires an SSL certificate and a private key to be provided to the docker container at runtime.

For example, if your certificate files are found locally at `./private/broker.crt` and `./private/broker.key`, provide these files to the docker container by mounting the folder and using the `HTTPS_CERT` and `HTTPS_KEY` environment variables:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITHUB_TOKEN=secret-github-token \
           -e PORT=8000 \
           -e HTTPS_CERT=/private/broker.crt \
           -e HTTPS_KEY=/private/broker.key \
           -e BROKER_CLIENT_URL=https://my.broker.client:8000 \
           -v /local/path/to/private:/private \
       snyk/broker:github-com
```

Note that `BROKER_CLIENT_URL` now has the HTTPS scheme.

#### Git with an internal certificate

By default, the Broker client establishes HTTPS connections to the Git. If your Git is serving an internal certificate (signed by your own CA), you can provide the CA certificate to the Broker client.

For example, if your CA certificate is at `./private/ca.cert.pem`, provide it to the docker container by mounting the folder and using the `CA_CERT` environment variable:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e BITBUCKET_USERNAME=username \
           -e BITBUCKET_PASSWORD=password \
           -e BITBUCKET=your.bitbucket-server.domain.com \
           -e BITBUCKET_API=your.bitbucket-server.domain.com/rest/api/1.0 \
           -e PORT=8000 \
           -e CA_CERT=/private/ca.cert.pem \
           -v /local/path/to/private:/private \
       snyk/broker:bitbucket-server
```

### Custom approved-listing filter

The default approved-listing filter supports the bare minimum to operate on all repositories supported by Snyk. In order to customize the approved-listing filter, create the default one locally by installing `snyk-broker` and running `broker init [Git type]`. The created `accept.json` is the default filter for the chosen Git. Place the file in a separate folder such as `./private/accept.json`, and provide it to the docker container by mounting the folder and using the `ACCEPT` environment variable:

```
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITHUB_TOKEN=secret-github-token \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=https://my.broker.client:8000 \
           -e ACCEPT=/private/accept.json
           -v /local/path/to/private:/private \
       snyk/broker:github-com
```

### Mounting Secrets
Sometime it is required to load sensitive configurations (GitHub/Snyk's token) from a file instead from environment variables. Broker is using [dotenv](https://www.npmjs.com/package/dotenv) to load the config, so the process is relatively simple:
* Create a file named `.env` and put your sensitive config there:
* Mount this file (for example, using [Kuberentes secret](https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/#create-a-pod-that-has-access-to-the-secret-data-through-a-volume)). Mount the file to be somewhere like `/broker`.
* Change the workdir of the docker image to be `/broker`/
Example of such file is located in your broker container at $HOME/.env

## Misc

* [License: Apache License, Version 2.0](https://github.com/snyk/broker/blob/master/LICENSE)
* [Contributing](https://github.com/snyk/broker/blob/master/.github/CONTRIBUTING.md)
* [Security](https://github.com/snyk/broker/blob/master/SECURITY.md)
