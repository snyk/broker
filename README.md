[![Snyk logo](https://snyk.io/style/asset/logo/snyk-print.svg)](https://snyk.io)

[![Known Vulnerabilities](https://snyk.io/test/github/snyk/broker/badge.svg?style=flat-square)](https://snyk.io/test/github/snyk/broker)

***

# snyk/broker

The Snyk Broker ("Broker") proxies access between the Snyk application at [snyk.io](https://app.snyk.io) and your Source Code Management (SCM) repositories (GitHub.com, Bitbucket Server, etc.) and other backend systems (Jira, Artifactory etc.) which may be on-premise or in the cloud. Throughout this document these are all referred to as _backend systems_.

- [snyk/broker](#snyk-broker)
  * [Overview](#overview)
  * [Usage](#usage)
    + [Common environment variables](#common-environment-variables)
  * [Supported backend systems](#supported-backend-systems)
    + [GitHub.com](#githubcom)
      - [Command-line arguments](#command-line-arguments)
      - [Derived docker image](#derived-docker-image)
    + [GitHub Enterprise](#github-enterprise)
      - [Command-line arguments](#command-line-arguments-1)
      - [Derived docker image](#derived-docker-image-1)
    + [Bitbucket Server](#bitbucket-server)
      - [Command-line arguments](#command-line-arguments-2)
      - [Derived docker image](#derived-docker-image-2)
    + [GitLab](#gitlab)
      - [Command-line arguments](#command-line-arguments-3)
      - [Derived docker image](#derived-docker-image-3)
    + [Azure Repos](#azure-repos)
      - [Command-line arguments](#command-line-arguments-4)
      - [Derived docker image](#derived-docker-image-4)
    + [Artifactory](#artifactory)
      - [Command-line arguments](#command-line-arguments-5)
      - [Derived docker image](#derived-docker-image-5)
    + [Nexus 3](#nexus-3)
      - [Command-line arguments](#command-line-arguments-6)
      - [Derived docker image](#derived-docker-image-6)
    + [Jira](#jira)
      - [Command-line arguments](#command-line-arguments-7)
      - [Derived docker image](#derived-docker-image-7)
    + [Container registry agent](#container-registry-agent)
      - [Command-line arguments](#command-line-arguments-8)
      - [Derived docker image](#derived-docker-image-8)
    + [Monitoring](#monitoring)
      - [Health Check endpoint](#health-check-endpoint)
      - [System Check endpoint](#system-check-endpoint)
      - [Logging](#logging)
    + [Advanced Configuration](#advanced-configuration)
      - [HTTPS](#https)
      - [Git with an internal certificate](#git-with-an-internal-certificate)
      - [Infrastructure as Code (IaC)](#infrastructure-as-code--iac-)
      - [Changing the Auth Method](#changing-the-auth-method)
    + [Credential Pooling](#credential-pooling)
      - [Limitations](#limitations)
      - [Credentials Matrix](#credentials-matrix)
    + [Custom approved-listing filter](#custom-approved-listing-filter)
      - [Types of Filtering](#types-of-filtering)
        * [By Header](#by-header)
    + [Mounting Secrets](#mounting-secrets)
    + [Troubleshooting](#troubleshooting)
      - [Support of big manifest files (> 1Mb) for GitHub / GitHub Enterprise](#support-of-big-manifest-files----1mb--for-github---github-enterprise)
  * [Misc](#misc)

<small><i><a href='http://ecotrust-canada.github.io/markdown-toc/'>Table of contents generated with markdown-toc</a></i></small>


## Overview

The Broker consists of two parts

- **Broker Client**: A Docker image deployed in your infrastructure.
- **Broker Server**: An application deployed in Snyks infrastructure.

(as the Broker Server is provided by Snyk and no installation is required on your part, all further descriptions in this README refer only to the Broker Client unless stated otherwise)

The Broker Client establishes a websocket 'tunnel' to the Broker Server, proxying requests from [snyk.io](https://app.snyk.io) to your backend system (e.g. fetching manifest files from monitored repositories), and vice-versa (webhooks posted by the backend system). Because this tunnel is initially established by the Broker Client making an outbound request, there is no need to grant permissions to specific Snyk IP addresses in your firewall.

The Broker client runs within your internal network, keeping sensitive data such as Git tokens within the network perimeter. The websocket tunnel adds only relevant requests to an approved list, narrowing down the access permissions to the bare minimum required for Snyk to actively monitor a repository.

[![Broker diagram](https://3099555661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-MdwVZ6HOZriajCf5nXH%2Fuploads%2FPJDOf4uxixdsUbRnqRdy%2FSnyk%20Broker%20diagram.png?alt=media&token=91e90beb-76e2-4cad-9ae1-69a5ea7e647a "Broker diagram")](https://docs.snyk.io/features/snyk-broker/broker-introduction)

## Usage

The Broker client is published as a set of Docker images, each configured for a specific type of backend system. Standard and custom configuration is performed with environment variables as described below, per integration type.

### Common environment variables

The following environment variables are mandatory when configuring the Broker client for all types of backend system:

- `BROKER_TOKEN` - a secret Snyk Broker token which is unique to you. This can be obtained from your Snyk Org settings view ([app.snyk.io](https://app.snyk.io)) or from Snyk customer support. You can use the same `BROKER_TOKEN` with multiple organizations within your top-level group.
- `PORT` - the local port at which the Broker client accepts connections. Default is 8000.

The following environment variable is mandatory for most implementations of the Broker client:

- `BROKER_CLIENT_URL` - the full URL (including the "http://" transport prefix and the port number defined in $PORT) of the Broker client itself, required to initialize the webhooks from the backend system. If you are running an external backend system such as Github.com, this will likely take the form of a domain name, such as `http://my.broker.client:8000`. If you are running an on-premise backend system such as Github Enterprise and have not set up a domain name in your internal DNS, this may take the form of an IP address, such as `http://12.34.56.78:8000`

Other environment variables which are backend system-specific are defined below.

## Supported backend systems

### GitHub.com

To install the Broker client with GitHub.com, run `docker pull snyk/broker:github-com`. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `PORT` - See [Common environment variables](#common-environment-variables).
- `BROKER_CLIENT_URL` - See [Common environment variables](#common-environment-variables).
- `GITHUB_TOKEN` - a Github [personal access token (PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with `repo`, `read:org` and `admin:repo_hook` scopes.

#### Command-line arguments

You can run the Docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e GITHUB_TOKEN=<secret-github-token> \
       snyk/broker:github-com
```

Proxy configuration, see [Configure Docker to use a proxy server](https://docs.docker.com/network/proxy/)

```Proxy
           -e HTTP_PROXY=http://my.proxy.address:8080
           -e HTTPS_PROXY=http://my.proxy.address:8080
           -e NO_PROXY=*.test.example.com,.example2.com,127.0.0.0/8
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:github-com

ENV BROKER_TOKEN      <secret-broker-token>
ENV PORT              8000
ENV BROKER_CLIENT_URL http://my.broker.client:8000
ENV GITHUB_TOKEN      <secret-github-token>
```

### GitHub Enterprise

To install the Broker client with a GitHub Enterprise deployment, run `docker pull snyk/broker:github-enterprise`. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `PORT` - See [Common environment variables](#common-environment-variables).
- `BROKER_CLIENT_URL` - See [Common environment variables](#common-environment-variables).
- `GITHUB_TOKEN` - a Github [personal access token (PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with `repo`, `read:org` and `admin:repo_hook` scopes.
- `GITHUB` - the hostname of your GitHub Enterprise deployment, such as `your.ghe.domain.com`.
- `GITHUB_API` - the API endpoint of your GitHub Enterprise deployment. Should be `$GITHUB/api/v3`.
- `GITHUB_GRAPHQL` - the graphql endpoint of your GitHub Enterprise deployment. Should be `$GITHUB/api`.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://12.34.56.78:8000 \
           -e GITHUB_TOKEN=<secret-github-token> \
           -e GITHUB=your.ghe.domain.com \
           -e GITHUB_API=your.ghe.domain.com/api/v3 \
           -e GITHUB_GRAPHQL=your.ghe.domain.com/api \
       snyk/broker:github-enterprise
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:github-enterprise

ENV BROKER_TOKEN      <secret-broker-token>
ENV PORT              8000
ENV BROKER_CLIENT_URL http://12.34.56.78:8000
ENV GITHUB_TOKEN      <secret-github-token>
ENV GITHUB            your.ghe.domain.com
ENV GITHUB_API        your.ghe.domain.com/api/v3
ENV GITHUB_GRAPHQL    your.ghe.domain.com/api
```

### Bitbucket Server

To install the Broker client with a Bitbucket Server deployment, run `docker pull snyk/broker:bitbucket-server`. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `PORT` - See [Common environment variables](#common-environment-variables).
- `BROKER_CLIENT_URL` - See [Common environment variables](#common-environment-variables).
- `BITBUCKET_USERNAME` - the Bitbucket Server username.
- `BITBUCKET_PASSWORD` - the Bitbucket Server password.
- `BITBUCKET` - the hostname of your Bitbucket Server deployment, such as `your.bitbucket-server.domain.com`.
- `BITBUCKET_API` - the API endpoint of your Bitbucket Server deployment. Should be `$BITBUCKET/rest/api/1.0`.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://12.34.56.78:8000 \
           -e BITBUCKET_USERNAME=<bitbucket-username> \
           -e BITBUCKET_PASSWORD=<bitbucket-password> \
           -e BITBUCKET=your.bitbucket-server.domain.com \
           -e BITBUCKET_API=your.bitbucket-server.domain.com/rest/api/1.0 \
       snyk/broker:bitbucket-server
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:bitbucket-server

ENV BROKER_TOKEN        <secret-broker-token>
ENV PORT                8000
ENV BROKER_CLIENT_URL   http://12.34.56.78:8000
ENV BITBUCKET_USERNAME  <bitbucket-username>
ENV BITBUCKET_PASSWORD  <bitbucket-password>
ENV BITBUCKET           your.bitbucket-server.domain.com
ENV BITBUCKET_API       your.bitbucket-server.domain.com/rest/api/1.0
```


### GitLab

To install the Broker client with GitLab.com or an on-premises GitLab deployment, run `docker pull snyk/broker:gitlab` tag. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `PORT` - See [Common environment variables](#common-environment-variables).
- `BROKER_CLIENT_URL` - See [Common environment variables](#common-environment-variables).
- `GITLAB_TOKEN` - a Gitlab [personal access token (PAT)](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) with `api` scope.
- `GITLAB` - the hostname of your GitLab deployment, such as `your.gitlab.domain.com` or `GitLab.com`.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e GITLAB_TOKEN=<secret-gitlab-token> \
           -e GITLAB=your.gitlab.domain.com \
       snyk/broker:gitlab
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:gitlab

ENV BROKER_TOKEN        <secret-broker-token>
ENV PORT                8000
ENV BROKER_CLIENT_URL   http://my.broker.client:8000
ENV GITLAB_TOKEN        <secret-gitlab-token>
ENV GITLAB              your.gitlab.domain.com
```

### Azure Repos

To install the Broker client with [Azure](https://azure.microsoft.com/en-us/services/devops/), run `docker pull snyk/broker:azure-repos` tag. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `PORT` - See [Common environment variables](#common-environment-variables).
- `BROKER_CLIENT_URL` - See [Common environment variables](#common-environment-variables).
- `AZURE_REPOS_TOKEN` - an Azure Repos [personal access token](https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate). Required scopes: ensure _Custom defined_ is selected and under **Code** select _Read & write_
- `AZURE_REPOS_ORG` - organization name, which can be found in your Organization Overview page in Azure
- `AZURE_REPOS_HOST` - the hostname of your Azure Repos Server deployment, such as `your.azure-server.domain.com`.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e AZURE_REPOS_TOKEN=<secret-azure-token> \
           -e AZURE_REPOS_ORG=org-name \
           -e AZURE_REPOS_HOST=your.azure-server.domain.com \
       snyk/broker:azure-repos
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:azure-repos

ENV BROKER_TOKEN        <secret-broker-token>
ENV PORT                8000
ENV BROKER_CLIENT_URL   http://my.broker.client:8000
ENV AZURE_REPOS_TOKEN   <secret-azure-token>
ENV AZURE_REPOS_ORG     org-name
ENV AZURE_REPOS_HOST    your.azure-server.domain.com
```

### Artifactory

To install the Broker client with an artifactory deployment, run `docker pull snyk/broker:artifactory` tag. The following environment variables are needed to customize the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `ARTIFACTORY_URL` - the URL of your artifactory deployment, such as `<yourdomain>.artifactory.com/artifactory`.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e ARTIFACTORY_URL=<yourdomain>.artifactory.com/artifactory \
       snyk/broker:artifactory
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:artifactory

ENV BROKER_TOKEN      <secret-broker-token>
ENV ARTIFACTORY_URL   <yourdomain>.artifactory.com
```

### Nexus 3

To install the Broker client with an Nexus 3 deployment, run `docker pull snyk/broker:nexus` tag. The following environment variables are needed to customize the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `BASE_NEXUS_URL` - the URL of your Nexus 3 deployment, such as `https://[<user>:<password>@]<your.nexus.hostname>`.
- `BROKER_CLIENT_VALIDATION_URL` - Nexus validation url, checked by the Broker client [System Check](#system-check-endpoint) endpoint. If Nexus user requires auth, use `$BASE_NEXUS_URL/service/rest/v1/status/check` (e.g. `https://<user>:<password>@<your.nexus.hostname>/service/rest/v1/status/check`) otherwise use `<your.nexus.hostname>/service/rest/v1/status` (without the `<user>:<password>@`).
- (Optional) `RES_BODY_URL_SUB` - This URL substitution is required for NPM/Yarn integration and is the same as the URL of the Nexus without credentials appended with `/repository`, e.g. `https://<your.nexus.hostname>/repository`

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e BASE_NEXUS_URL=https://[<user>:<password>@]<your.nexus.hostname> \
           -e BROKER_CLIENT_VALIDATION_URL=https://<your.nexus.hostname>/service/rest/v1/status[/check] \
           -e RES_BODY_URL_SUB=https://<your.nexus.hostname>/repository \
       snyk/broker:nexus
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:nexus

ENV BROKER_TOKEN                     <secret-broker-token>
ENV BASE_NEXUS_URL                   https://[<user>:<password>@]<your.nexus.hostname>
ENV BROKER_CLIENT_VALIDATION_URL     https://<your.nexus.hostname>/service/rest/v1/status[/check]
ENV RES_BODY_URL_SUB                 https://<your.nexus.hostname>/repository
```

### Jira

To install the Broker client with a Jira deployment, run `docker pull snyk/broker:jira` tag. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `PORT` - See [Common environment variables](#common-environment-variables).
- `BROKER_CLIENT_URL` - See [Common environment variables](#common-environment-variables).
- `JIRA_USERNAME` - the Jira username.
- `JIRA_PASSWORD` - the Jira password.
- `JIRA_HOSTNAME` - the hostname of your Jira deployment, such as `your.jira.domain.com`.

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e JIRA_USERNAME=<username> \
           -e JIRA_PASSWORD=<password> \
           -e JIRA_HOSTNAME=your.jira.domain.com \
       snyk/broker:jira
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:jira

ENV BROKER_TOKEN        <secret-broker-token>
ENV PORT                8000
ENV BROKER_CLIENT_URL   http://my.broker.client:8000
ENV JIRA_USERNAME       <username>
ENV JIRA_PASSWORD       <password>
ENV JIRA_HOSTNAME       your.jira.domain.com
```

### Container registry agent

To install the Broker client with a container registry agent deployment, run `docker pull snyk/broker:container-registry-agent`. The following environment variables are mandatory to configure the Broker client:

- `BROKER_TOKEN` - See [Common environment variables](#common-environment-variables).
- `PORT` - See [Common environment variables](#common-environment-variables).
- `BROKER_CLIENT_URL` - See [Common environment variables](#common-environment-variables).
- `CR_AGENT_URL` - The URL of your container registry agent (including scheme and - port) to which brokered requests would be forwarded.
- `CR_TYPE` - The container registry type as listed in supporter registries, for example "DockerHub", "GoogleCR", "ArtifactoryCR".
- `CR_BASE` - The hostname of the container registry api to connect to, for example: "cr.host.com".
- `CR_USERNAME` - The username for authenticating to container registry api. **(Not used for DigitalOcean container registry)**.
- `CR_PASSWORD` - The password for authenticating to container registry api. **(Not used for DigitalOcean container registry)**.
- `CR_TOKEN` - Authentication token for DigitalOcean container registry. **(Only used for Digital Ocean container registry)**

#### Command-line arguments

You can run the docker container by providing the relevant configuration:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e CR_AGENT_URL=https://my.container.registry.agent \
           -e CR_TYPE=container-registry-type \
           -e CR_BASE=your.container.registry.domain.com \
           -e CR_USERNAME=<secret-container-registry-username> \
           -e CR_PASSWORD=<secret-container-registry-password> \
           -e CR_TOKEN=<secret-digital-ocean-token> \
       snyk/broker:container-registry-agent
```

#### Derived docker image

Another option is to build your own docker image and override relevant environment variables:

```dockerfile
FROM snyk/broker:container-registry-agent

ENV BROKER_TOKEN          <secret-broker-token>
ENV PORT                  8000
ENV BROKER_CLIENT_URL     http://my.broker.client:8000
ENV CR_AGENT_URL          https://my.container.registry.agent
ENV CR_TYPE               container-registry-type
ENV CR_BASE               your.container.registry.domain.com
ENV CR_USERNAME           <secret-container-registry-username>
ENV CR_PASSWORD           <secret-container-registry-password>
ENV CR_TOKEN              <secret-digital-ocean-token>
```

### Monitoring

You can use `curl` or an equivalent tool on the machine where the Docker image is installed or on another machine within your infrastructure to check on the health of the Broker client.

To run the following commands from the machine where the Docker image is installed, run `curl http://loopback:$PORT<endpoint>`. To run the command from another machine within your infrastructure, run `curl http://$BROKER_CLIENT_URL:$PORT<endpoint>`.

#### Health Check endpoint

The Broker exposes an endpoint at `/healthcheck` (e.g. `http://my.broker.client:8000/healthcheck`), which can be used to monitor the health of the Broker itself and the status of the websocket connection to the Broker Server.

This endpoint responds with status code `200 OK` when the internal request is successful or `500 Internal Server Error` when the websocket connection is not open. If the Broker is not running the `curl` request will time out.

In the case of a `200 OK`, the response body is as follows:

```console
{
  "ok": true,
  "websocketConnectionOpen": true,
  "brokerServerUrl": "https://broker.snyk.io",
  "version": "4.134.0",
  "transport": "websocket"
}
```


To change the location of the healthcheck endpoint, you can specify an alternative path via an environment variable:

```dockerfile
ENV BROKER_HEALTHCHECK_PATH /path/to/healthcheck
```

#### System Check endpoint

The Broker client exposes an endpoint at `/systemcheck` (e.g. `http://my.broker.client:8000/systemcheck`), which can be used to validate the connection (and credentials, where applicable) between the Broker and the backend system.

A request to this endpoint causes the Broker client to make a request to a preconfigured URL, and report on the success of the request. The supported configuration is:

* `BROKER_CLIENT_VALIDATION_URL` - the URL to which the request will be made.
* `BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER` - [optional] the `Authorization` header value of the request. Mutually exclusive with `BROKER_CLIENT_VALIDATION_BASIC_AUTH`.
* `BROKER_CLIENT_VALIDATION_BASIC_AUTH` - [optional] the basic auth credentials (`username:password`) to be base64 encoded and placed in the `Authorization` header value of the request. Mutually exclusive with `BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER`.
* `BROKER_CLIENT_VALIDATION_METHOD` - [optional] the HTTP method of the request (default is `GET`).
* `BROKER_CLIENT_VALIDATION_TIMEOUT_MS` - [optional] the request timeout in milliseconds (default is 5000 ms).

This endpoint responds with status code `200 OK` when the internal request is successful, and returns `[{ ok: true, ... }]` in the response body (one object in the array per credential, see [Credential Pooling](#credential-pooling)). If the internal request fails, this endpoint responds with status code `500 Internal Server Error` and `[{ ok: false }, ...]` in the response body. If the Broker is not running the `curl` request will time out.

For example, a response body when using Github.com as the SCM might be:

```console
[
  {
    "brokerClientValidationUrl": "https://api.github.com/user",
    "brokerClientValidationMethod": "GET",
    "brokerClientValidationTimeoutMs": 5000,
    "brokerClientValidationUrlStatusCode": 200,
    "ok": true,
    "maskedCredentials": "ghp***ysi"
  }
]
```

To change the location of the systemcheck endpoint, you can specify an alternative path via an environment variable:

```dockerfile
ENV BROKER_SYSTEMCHECK_PATH /path/to/systemcheck
```

#### Logging

By default the log level of the Broker is set to INFO. All backend system responses regardless of HTTP status code will be logged by the Broker client. The following settings can be set in your environment variables to alter the logging behaviour:

| Key  | Default | Notes |
|---|---|---|
| LOG_LEVEL | info | Set to "debug" for all logs |
| LOG_ENABLE_BODY | false | Set to "true" to include the response body in the Client logs |

### Advanced Configuration

#### HTTPS

The Broker client runs an HTTP server by default. It can be configured to run an HTTPS server for local connections. This requires an SSL certificate and a private key to be provided to the Docker container at runtime.

For example, if you are using Github as your SCM and your certificate files are found locally at `./private/broker.crt` and `./private/broker.key`, provide these files to the Docker container by mounting the folder and using the `HTTPS_CERT` and `HTTPS_KEY` environment variables:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=https://my.broker.client:8000 \
           -e GITHUB_TOKEN=<secret-github-token> \
           -e HTTPS_CERT=/private/broker.crt \
           -e HTTPS_KEY=/private/broker.key \
           -v /local/path/to/private:/private \
       snyk/broker:github-com
```

Note that `BROKER_CLIENT_URL` now has the HTTPS scheme.

#### Git with an internal certificate

By default, the Broker client establishes HTTPS connections to the backend system. If your backend system is serving an internal certificate (signed by your own CA), you can provide the CA certificate to the Broker client.

For example, if you are using BitBucket as your SCM and your CA certificate is at `./private/ca.cert.pem`, provide it to the Docker container by mounting the folder and using the `CA_CERT` environment variable:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BITBUCKET_USERNAME=<username> \
           -e BITBUCKET_PASSWORD=<password> \
           -e BITBUCKET=your.bitbucket-server.domain.com \
           -e BITBUCKET_API=your.bitbucket-server.domain.com/rest/api/1.0 \
           -e CA_CERT=/private/ca.cert.pem \
           -v /local/path/to/private:/private \
       snyk/broker:bitbucket-server
```

#### Infrastructure as Code (IaC)

By default, some file types used by Infrastructure-as-Code (IaC) are not enabled. To grant the Broker access to IaC files in your repository, such as Terraform for example, you can simply add an environment variable ACCEPT_IAC with any combination of tf,yaml,yml,json,tpl

Example:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITHUB_TOKEN=secret-github-token \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e ACCEPT_IAC=tf,yaml,yml,json,tpl
       snyk/broker:github-com
```

You can otherwise edit your `accept.json`, add the relevant IaC specific rules and load the customized accept file into the container. Note that if a custom accept file (from a separate folder) is used (using ACCEPT environment variable), the ACCEPT_IAC mechanism cannot be used.

For example, if you are using GitHub and you would like to give the Broker access to your Terraform files, you should add the following rules to your `accept.json`:

```console
{
  "//": "used to enable scanning of Terraform files",
  "method": "GET",
  "path": "/repos/:name/:repo/contents/:path*/*.tf",
  "origin": "https://${GITHUB_TOKEN}@${GITHUB_API}"
},
{
  "//": "used to enable scanning of Terraform files",
  "method": "GET",
  "path": "/repos/:name/:repo/contents/:path*%2F*.tf",
  "origin": "https://${GITHUB_TOKEN}@${GITHUB_API}"
},
```

More details can be found here:
[Detecting infrastructure as code files using a broker](https://docs.snyk.io/products/snyk-infrastructure-as-code/detecting-infrastructure-as-code-files-using-a-broker)

#### Snyk Code
By default, git clone capabilities required by Snyk Code are disabled. To grant the Broker access to perform a git clone of your repo, you can simply add an environment variable ACCEPT_CODE=true

NOTE: This feature is currently under closed beta. Please speak with your Snyk account management team to find out more.

Example:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=secret-broker-token \
           -e GITHUB_TOKEN=secret-github-token \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=http://my.broker.client:8000 \
           -e ACCEPT_CODE=true
       snyk/broker:github-com
```
Note that if a custom accept file (from a separate folder) is used (using ACCEPT environment variable), the ACCEPT_CODE mechanism cannot be used.

#### Changing the Auth Method

Each integration has an auth method set by default, with the exact method varying by service.

BitBucket Server/Datacenter, for example, uses Basic Auth with a username and password for example:

`accept.json`:
```json
{
  "private": [
    {
      ...,
      "auth": {
         "scheme": "basic",
         "username": "${BITBUCKET_USERNAME}",
         "password": "${BITBUCKET_PASSWORD}"
      }
    },
    ...
  ]
}
```

For Artifactory, it's configured in the `.env` file by default:

`.env`:
```shell
# The URL to your artifactory
# If not using basic auth this will only be "<yourdomain.artifactory.com>/artifactory"
ARTIFACTORY_URL=<username>:<password>@<yourdomain.artifactory.com>/artifactory
```


For GitHub, it's part of the `origin` field:

`accept.json`:
```json
{
  "private": [
    {
      ...,
      "origin": "https://${GITHUB_TOKEN}@${GITHUB_API}"
    },
    ...
  ]
}
```

The authentication method can be overridden. Valid values for `scheme` are `bearer`, `token`, and `basic`, which set the Authorization header to `Bearer`, `Token`, and `Basic`, respectively. In the case a bearer token is preferred, the `accept.json` can be configured as such:

`accept.json`:
```json
{
  "private": [
    {
      ...,
      "auth": {
        "scheme": "bearer",
        "token": "${BEARER_TOKEN}"
      }
    },
    ...
  ]
}
```

Note that you must set this for every individual object in the `private` array.

If `scheme` is `bearer` or `token`, you must provide a `token`, and if it's `basic`, you must provide a `username` and `password`.

This will override any other configured authentication method (e.g., setting the token in the `origin` field, or in the `.env` file).

#### Multi-tenant
To use Broker with different multi-tenant environments, set `BROKER_SERVER_URL` to be one of the following URLs depending which environment you are using:

Europe: `https://broker.eu.snyk.io`<br>
Australia: `https://broker.au.snyk.io`<br>

```
-e BROKER_SERVER_URL=<BROKER_SERVER_URL>
```

### Credential Pooling
Under some circumstances it can be desirable to create a "pool" of credentials, e.g., to work around rate-limiting issues. This can be achieved by creating an environment variable ending in `_POOL`, separate each credential with a comma, and the Broker Client will then, when performing variable replacement, look to see if the variable in use has a variant with a `_POOL` suffix, and use the next item in that pool if so. For example, if you have set the environment variable `GITHUB_TOKEN`, but want to provide multiple tokens, you would do this instead:

```shell
GITHUB_TOKEN_POOL=token1, token2, token3
```

and then the Broker Client would, any time it needed `GITHUB_TOKEN`, instead take the next item from the `GITHUB_TOKEN_POOL` variable in round-robin fashion until it reaches the end and then takes the first one again.

Calling the `/systemcheck` endpoint will validate all credentials, in order, and will return an array where the first item is the first credential and so on. For example, if you were running the GitHub Client and had this:

```shell
GITHUB_TOKEN_POOL=good_token, bad_token
```

The `/systemcheck` endpoint would return the following, where the first object is for `good_token` and the second for `bad_token`:

```json
[
  {
    "brokerClientValidationUrl": "https://api.github.com/user",
    "brokerClientValidationMethod": "GET",
    "brokerClientValidationTimeoutMs": 5000,
    "brokerClientValidationUrlStatusCode": 200,
    "ok": true,
    "maskedCredentials": "goo***ken"
  },
  {
    "brokerClientValidationUrl": "https://api.github.com/user",
    "brokerClientValidationMethod": "GET",
    "brokerClientValidationTimeoutMs": 5000,
    "ok": false,
    "error": "401 - {\"message\":\"Bad credentials\",\"documentation_url\":\"https://docs.github.com/rest\"}",
    "maskedCredentials": "bad***ken"
  }
]
```

The credentials are masked, though note that if your credentials contain 6 or fewer characters, they will be completely replaced with the mask.

#### Limitations

Credential validity is not checked before using a credential, nor are invalid credentials removed from the pool, so it is _strongly_ recommended that credentials be used exclusively by the Broker Client to avoid credentials reaching rate limits at different times, and that the `/systemcheck` endpoint be called before use.

Some providers, such as GitHub, do rate-limiting on a per-user basis, not a per-token or per-credential basis, and in those cases you will need to create multiple accounts with one credential per account.

#### Credentials Matrix

Generating a Matrix of credentials is not supported.

A "Matrix" in this case is defined as taking two (or more) `_POOL`s of length `x` and `y`, and producing one final pool of length `x * y`. For example, given an input like:

```shell
USERNAME_POOL=u1, u2, u3
PASSWORD_POOL=p1, p2, p3
CREDENTIALS_POOL=$USERNAME:$PASSWORD
```

while Matrix support would generate this internally:

```shell
CREDENTIALS_POOL=u1:p1,u1:p2,u1:p3,u2:p1,u2:p2,u2:p3,u3:p1,u3:p2,u3:p3
```

the Broker Client would instead generate this internally, using only the first pool it finds:

```shell
CREDENTIALS_POOL=u1:$PASSWORD,u2:$PASSWORD,u3:$PASSWORD
```

### Custom approved-listing filter

The default approved-listing filter supports the bare minimum to operate on all repositories supported by Snyk. In order to customize the approved-listing filter, create the default one locally by installing `snyk-broker` and running `broker init [Git type]`. The created `accept.json` is the default filter for the chosen Git. Place the file in a separate folder such as `./private/accept.json`, and provide it to the docker container by mounting the folder and using the `ACCEPT` environment variable:

```console
docker run --restart=always \
           -p 8000:8000 \
           -e BROKER_TOKEN=<secret-broker-token> \
           -e PORT=8000 \
           -e BROKER_CLIENT_URL=https://my.broker.client:8000 \
           -e GITHUB_TOKEN=<secret-github-token> \
           -e ACCEPT=/private/accept.json
           -v /local/path/to/private:/private \
       snyk/broker:github-com
```

#### Types of Filtering

##### By Header

Add a validation block with the following key/values:

| Key | Value | Value Type | Example |
|-|-|-|-|
| header | The name of the header you wish to filter on. If this is defined then the named header must explicitly exist on the request otherwise it will be blocked | String | `accept` |
| values | The header value must match one of the defined strings | Array\<String\> | `["application/vnd.github.v4.sha"]` |

For example, to only allow the SHA Media Type accept header for requests to the GitHub Commits API you would add the following:

```json
{
    "method": "GET",
    "path": "/repos/:name/:repo/commits/:ref",
    "origin": "https://${GITHUB_TOKEN}@${GITHUB_API}",
    "valid": [
        {
            "header": "accept",
            "values": ["application/vnd.github.v4.sha"]
        }
    ]
}
```

### Mounting Secrets

Sometime it is required to load sensitive configurations (GitHub/Snyk's token) from a file instead from environment variables. Broker is using [dotenv](https://www.npmjs.com/package/dotenv) to load the config, so the process is relatively simple:

* Create a file named `.env` and put your sensitive config there.
* Mount this file (for example, using [Kubernetes secret](https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/#create-a-pod-that-has-access-to-the-secret-data-through-a-volume)). Mount the file to be somewhere like `/broker`.
* Change the workdir of the docker image to be `/broker`/

Example of such a file is located in your broker container at $HOME/.env

### Troubleshooting

Your primary source of troubleshooting information should be the [Snyk Broker Troubleshooting Document](https://docs.snyk.io/features/snyk-broker/troubleshooting-broker). This document contains both basic troubleshooting information and also links to more detailed documents.

#### Support of big manifest files (> 1Mb) for GitHub / GitHub Enterprise

One of the reason for failing of open Fix/Upgrade PRs or PR/recurring tests might be fetching big manifest files (> 1Mb) failure. To address this issue, additional Blob API endpoint should be whitelisted in `accept.json`:

- should be in `private` array
```json
{
    "//": "used to get given manifest file",
    "method": "GET",
    "path": "/repos/:owner/:repo/git/blobs/:sha",
    "origin": "https://${GITHUB_TOKEN}@${GITHUB_API}"
}
```
**Note** To ensure the maximum possible security, we do not enable this rule by default, as usage of this endpoint means that the Snyk platform can theoretically access all files in this repository, as the path does not include specific allowed file names.

## Misc

* [License: Apache License, Version 2.0](https://github.com/snyk/broker/blob/master/LICENSE)
* [Contributing](https://github.com/snyk/broker/blob/master/.github/CONTRIBUTING.md)
* [Security](https://github.com/snyk/broker/blob/master/SECURITY.md)