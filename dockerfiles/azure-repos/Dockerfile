ARG BASE_IMAGE=snyk/broker:base


FROM ${BASE_IMAGE}

# Generate default accept filter
RUN broker init azure-repos
# Support for OpenShift - have to run after init to get accept.json and .env
USER root
RUN chgrp -R 0 /home/node && chmod -R g=u,o= /home/node && chown -R node /home/node
USER node

######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique Broker identifier
# ENV BROKER_TOKEN <broker-token>

# https://dev.azure.com/{azure-repos-org}
# ENV AZURE_REPOS_ORG <azure-repos-org>
# Guide how to get/create the token https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=preview-page
# Scopes: Ensure Custom defined is selected and under Code select Read & write
# ENV AZURE_REPOS_TOKEN <azure-repos-token>
# NOTA BENE: without `/` character in the end of URL
# ENV AZURE_REPOS_HOST dev.azure.com

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL
# ENV BROKER_CLIENT_URL "https://<broker.client.hostname>:$PORT"

EXPOSE $PORT

CMD ["broker", "--verbose"]
