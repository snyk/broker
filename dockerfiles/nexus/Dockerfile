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
RUN broker init nexus

######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique Broker identifier
# ENV BROKER_TOKEN <broker-token>

# The URL to your Nexus Repository Manager
# NOTA BENE: without `/` character in the end of URL
# ENV NEXUS_URL=<username>:<password>@<your.nexus.hostname>/repository

# Provide RES_BODY_URL_SUB with the URL of the nexus without credentials and http protocol
# This URL substitution is required for NPM integration
# RES_BODY_URL_SUB=http://<your.nexus.hostname>/repository

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from Jira
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT

EXPOSE $PORT

CMD ["broker", "--verbose"]
