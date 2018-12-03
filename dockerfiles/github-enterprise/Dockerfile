FROM node:8-slim

MAINTAINER Snyk Ltd

# Install broker
RUN npm install --global snyk-broker

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init github-enterprise



######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique broker identifier, copied from snyk.io org settings page
ENV BROKER_TOKEN <broker-token>

# Your personal access token to your github.com / GHE account
ENV GITHUB_TOKEN <github-token>

# The host where your GitHub Enterprise is running, excluding scheme.
ENV GITHUB=your.ghe.domain.com

# Github API endpoint, excluding scheme.
ENV GITHUB_API your.ghe.domain.com/api/v3

# Github GraphQL API endpoint, excluding scheme.
ENV GITHUB_GRAPHQL your.ghe.domain.com/api

# The port used by the broker client to accept webhooks
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from GitHub
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT

EXPOSE $PORT

CMD ["broker", "--verbose"]
