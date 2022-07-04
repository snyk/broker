FROM snyk/ubuntu as base

MAINTAINER Snyk Ltd

USER root

RUN apt-get update && apt-get install -y ca-certificates

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

ENV PATH=$PATH:/home/node/.npm-global/bin

RUN npm install --global snyk-broker



FROM snyk/ubuntu

ENV PATH=$PATH:/home/node/.npm-global/bin

COPY --from=base /home/node/.npm-global /home/node/.npm-global

COPY --from=base /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init azure-repos

######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# https://dev.azure.com/{azure-repos-org}
# ENV AZURE_REPOS_ORG <azure-repos-org>
# Guide how to get/create the token https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=preview-page
# Scopes: Ensure Custom defined is selected and under Code select Read & write
# ENV AZURE_REPOS_TOKEN <azure-repos-token>
# NOTA BENE: without `/` character in the end of URL
# ENV AZURE_REPOS_HOST dev.azure.com

# Your unique Broker identifier
# ENV BROKER_TOKEN <broker-token>

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL
# ENV BROKER_CLIENT_URL "https://<broker.client.hostname>:$PORT"

EXPOSE $PORT

CMD ["broker", "--verbose"]
