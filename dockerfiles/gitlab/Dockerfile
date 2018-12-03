FROM node:8-slim

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
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from Gitlab
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT


EXPOSE $PORT

CMD ["broker", "--verbose"]
