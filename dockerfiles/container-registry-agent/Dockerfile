FROM snyk/ubuntu as base

MAINTAINER Snyk Ltd

USER root

RUN apt-get update && apt-get install -y ca-certificates

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

ENV PATH=$PATH:/home/node/.npm-global/bin

RUN npm install --global snyk-broker



FROM node:16-alpine3.15

ENV PATH=$PATH:/home/node/.npm-global/bin

COPY --from=base /home/node/.npm-global /home/node/.npm-global

COPY --from=base /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Don't run as root
WORKDIR /home/node
USER node

# Prepare image entrypoint
COPY --chown=node:node ./bin/container-registry-agent/docker-entrypoint.sh ./docker-entrypoint.sh

# Generate default accept filter
RUN broker init container-registry-agent

######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique broker identifier, copied from snyk.io org settings page
# ENV BROKER_TOKEN <broker-token>

# The URL of your broker client (including scheme and port), used by container
# registry agent to call back to Snyk through brokered connection
# ENV BROKER_CLIENT_URL "https://<broker-client-host>:<broker-client-port>"

# The URL of your container registry agent
# ENV CR_AGENT_URL <agent-host>:<agent-port>

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

EXPOSE $PORT

ENTRYPOINT ["/home/node/docker-entrypoint.sh"]

CMD ["broker", "--verbose"]
