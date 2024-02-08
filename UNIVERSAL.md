# Universal Broker - Prototype

The Broker has been since its inception a piece of software relaying requests from Snyk to your private network and private SCMs.
HTTP<===>Server<===>Websocket<===>Client<===>HTTP

The main difference lied in the filtering rules allowing/denying the requests through as well as injecting the right hostname + authorization details, using credentials loaded in the client.

The Universal Broker keep the same operational model for each independent connection, and allows the usage of multiple connections in parallel from a single deployment.

## Connections

Universal Broker now requires to explictly specify the connection details in a configuration file that gets mounted into the running container before runtime.
A given connection contains the relevant information for the corresponding connection type it supports.
Each connection still expects a [unique Broker Token](https://docs.snyk.io/enterprise-setup/snyk-broker/prepare-snyk-broker-for-deployment#generate-credentials-in-the-target-application-for-snyk-broker) you can find in your organizaton integration settings in the Snyk platform.

All the [system type settings specified in our docs](https://docs.snyk.io/enterprise-setup/snyk-broker/install-and-configure-snyk-broker/install-and-configure-broker-using-docker#installation-using-docker) remain applicable but will for the most part be associated to a particular connection.

## How to run the Universal Broker
1. Create a file called `config.universal.json`
2. Use the boilerplate configuration below
    ```
    {
    "BROKER_CLIENT_CONFIGURATION": {
        "common": {
        "default": {
            "BROKER_SERVER_URL": "https://broker.snyk.io",
            "BROKER_HA_MODE_ENABLED": "false"
        }
        }
    },
    "CONNECTIONS": {
        "my github connection": {
        "type": "github",
        "identifier": "${BROKER_TOKEN_1}",
        "GITHUB_TOKEN": "${GITHUB_TOKEN}",
        "BROKER_CLIENT_URL": "http://my.broker.client.dns.hostname"
        },
        "my gitlab connection": {
        "type": "gitlab",
        "identifier": "${BROKER_TOKEN_2}",
        "GITLAB_TOKEN": "${GITLAB_TOKEN}",
        "GITLAB":"gitlab.com",
        "BROKER_CLIENT_URL": "http://my.broker.client.dns.hostname"
        }
    }
    }
    ```
3. Customize the default settings if you need to target a different Snyk environment or enable the high availability mode.
    > All common (meaning not specific to a connection) should be in the common default section.
    Note that overriding the config file values via environment variable is possible.
    >
    > As example, changing the BROKER_SERVER_URL above would simply require `export BROKER_SERVER_URL=https://broker.dev.snyk.io`.
    > **Caution !**
    >
    > Some settings are only "global", like insecure downstream mode for instance. In other words, you cannot use insecure http call to "my github connection" only. Instead, all requests made to both github and gitlab will be taking place over http.
4. Run the docker command as per this example, adjusting the settings to your needs:
    ```
    docker run --restart=always 
        -p 8001:8001 -e PORT=8001 \
        -e BROKER_CLIENT_URL=http(s)://<YOUR BROKER CLIENT URL> \
        -e UNIVERSAL_BROKER_ENABLED=true \
        -e BROKER_TOKEN_1=<YOUR BROKER TOKEN 1> \
        -e BROKER_TOKEN_2=<YOUR BROKER TOKEN 2> \
        -e GITLAB_TOKEN=<YOUR GITLAB TOKEN> \
        -e GITHUB_TOKEN=<YOUR GITHUB TOKEN> \
        -v $(pwd)/config.universal.json:/home/node/config.universal.json \
    snyk/broker:universal-dev
    ```
    You will recognize similar patterns to your current deployment method.

### Connections in Configuration file

The universal broker can technically support an unlimited number of connections, though the resource usage and the maximum capacity is something to consider. We strongly recommend to keep this number to be no greater than 6, and to keep mutualized broker connections used across many orgs for very active traffic (i.e Snyk Code scanning) into a dedicated client for better resource management.

Further development will bring better visibility of resource consumption out of the box. For the immediate term, we suggest you keep an eye on the resource levels as you add more and more connections.

### Connection details

All connections must have the following fields at minimum:
- `type`: Connection type, being on of the supported types listed below.
- `identifier`: Your broker token for that connection
- required values listed below for the corresponding type

#### Supported types

Any connection must be of one of the following types:
- artifactory
- azure-repos
- bitbucket-server
- container-registry-agent
- github-enterprise
- github
- gitlab
- jira-bearer-auth
- jira
- nexus
- nexus2

The required values to be specified for each type can be found below, or in the config.default.json in the repo.

#### Required values

For each type, the connection must have the following values.

##### artifactory
- "ARTIFACTORY_URL": "\<username>:\<password>@<yourdomain.artifactory.com>/artifactory"

##### azure-repos
- "AZURE_REPOS_TOKEN": "\<token>",
- "AZURE_REPOS_ORG": "\<organisation name>",
- "BROKER_CLIENT_URL": "http(s)://<broker.client.hostname>:\<port>"

##### bitbucket-server
- "BITBUCKET_USERNAME": "\<username>",
- "BITBUCKET_PASSWORD": "\<password>",
- "BITBUCKET": "bitbucket.yourdomain.com",
- "BROKER_CLIENT_URL": "http(s)://<broker.client.hostname>:\<port>"

##### container-registry-agent
- "CR_AGENT_URL": "https://\<agent-host>:\<agent-port>",
- "BROKER_CLIENT_URL": "http(s)://<broker.client.hostname>:\<port>"

##### github
- "GITHUB_TOKEN": "\<github-token>",
- "BROKER_CLIENT_URL": "http(s)://<broker.client.hostname>:\<port>"

##### github-enterprise
- "GITHUB_TOKEN": "\<github-token>",
- "GITHUB": "ghe.yourdomain.com",
- "BROKER_CLIENT_URL": "http(s)://<broker.client.hostname>:\<port>"

##### gitlab
- "GITLAB_TOKEN": "\<gitlab-token>",
- "GITLAB": "gitlab.yourdomain.com",
- "BROKER_CLIENT_URL": "http(s)://<broker.client.hostname>:\<port>"

##### jira
- "JIRA_USERNAME": "\<jira-username>",
- "JIRA_PASSWORD": "\<jira-password>",
- "JIRA_HOSTNAME": "jira.yourdomain.com"

##### jira-bearer-auth
- "JIRA_PAT": "\<jira-pat>",
- "JIRA_HOSTNAME": "jira.yourdomain.com"

##### nexus
- "BASE_NEXUS_URL": "https://\<username>:\<password>@<your.nexus.hostname>"

##### nexus2
- "BASE_NEXUS_URL": "https://\<username>:\<password>@<your.nexus.hostname>"