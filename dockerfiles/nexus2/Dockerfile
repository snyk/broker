FROM snyk/ubuntu as base

MAINTAINER Snyk Ltd

USER root

RUN apt-get update && apt-get install -y ca-certificates

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

ENV PATH=$PATH:/home/node/.npm-global/bin

RUN npm install --global snyk-broker

# Removing debug@0.7.4 (setheader transitive) to satisfy some scanners still reporting this false positive
RUN rm -rf /home/node/.npm-global/lib/node_modules/snyk-broker/node_modules/setheader/node_modules/debug
RUN rm -rf /home/node/.npm-global/lib/node_modules/snyk-broker/node_modules/tough-cookie
RUN npm i -g tough-cookie@4.1.3
RUN mv /home/node/.npm-global/lib/node_modules/tough-cookie /home/node/.npm-global/lib/node_modules/snyk-broker/node_modules


FROM snyk/ubuntu

ENV PATH=$PATH:/home/node/.npm-global/bin

COPY --from=base /home/node/.npm-global /home/node/.npm-global

COPY --from=base /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

USER root
# Removing debug@0.7.4 (setheader transitive) to satisfy some scanners still reporting this false positive
RUN rm -rf /home/node/.npm-global/lib/node_modules/snyk-broker/node_modules/setheader/node_modules/debug

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init nexus2
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

# The URL to your Nexus Repository Manager
# NOTA BENE: without `/` character in the end of URL
# If using basic auth, use https://<username>:<password>@<your.nexus.hostname>/nexus/content
# else use https://<your.nexus.hostname>/nexus/content
# ENV NEXUS_URL=<username>:<password>@<your.nexus.hostname>/nexus/content

# Provide RES_BODY_URL_SUB with the URL of the nexus without credentials and http protocol
# This URL substitution is required for NPM integration
# RES_BODY_URL_SUB=http://<your.nexus.hostname>/nexus/content

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from Jira
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT

EXPOSE $PORT

CMD ["broker", "--verbose"]
