FROM node:6-slim

MAINTAINER Snyk Ltd

# Install broker
RUN npm install --global snyk-broker

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init github



######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique broker identifier, copied from snyk.io org settings page
# ENV BROKER_TOKEN <broker-token>

# Your personal access token to your github.com / GHE account
# ENV GITHUB_TOKEN <github-token>

# The port used by the broker client to accept webhooks
# Default value is 7341
ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from GitHub
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT



#######################################
# Generic Broker Client configuration #
#######################################

# GitHub host is github.com
ENV GITHUB github.com

# The URL that the github API should be accessed, excluding scheme.
ENV GITHUB_API api.github.com

# The URL where raw file content is accessed, excluding scheme.
ENV GITHUB_RAW raw.githubusercontent.com

# The URL of the Snyk broker server
ENV BROKER_SERVER_URL https://broker.snyk.io

# The fine detail accept rules that allow Snyk to make API requests to your
# GitHub account
ENV ACCEPT accept.json




EXPOSE $PORT

HEALTHCHECK --interval=10s --timeout=1s \
  CMD wget -q --spider http://localhost:$PORT/healthcheck

CMD ["broker", "--verbose"]
