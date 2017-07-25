FROM node:6-slim

MAINTAINER Snyk Ltd

# Install broker
RUN npm install --global snyk-broker

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init gitlab



######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique broker identifier
ENV BROKER_TOKEN <broker-token>

# your personal token to your Gitlab server account
ENV GITLAB_TOKEN <gitlab-token>

# The Gitlab server API URL
ENV GITLAB your.gitlab.server.hostname

# The port used by the broker client to accept internal connections
# Default value is 7341
ENV PORT 7341


#######################################
# Generic Broker Client configuration #
#######################################


# The URL of the Snyk broker server
ENV BROKER_SERVER_URL https://broker.snyk.io

# The fine detail accept rules that allow Snyk to make API requests to your
# Bitbucket Server instance
ENV ACCEPT accept.json

# The path for the broker's internal healthcheck URL. Must start with a '/'.
ENV BROKER_HEALTHCHECK_PATH /healthcheck


EXPOSE $PORT

HEALTHCHECK --interval=10s --timeout=1s \
  CMD wget -q --spider http://localhost:${PORT}${BROKER_HEALTHCHECK_PATH}

CMD ["broker", "--verbose"]
