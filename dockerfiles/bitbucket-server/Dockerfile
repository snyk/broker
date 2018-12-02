FROM node:8-slim

MAINTAINER Snyk Ltd

# Install broker
RUN npm install --global snyk-broker

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init bitbucket-server



######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique broker identifier
ENV BROKER_TOKEN <broker-token>

# Your personal username to your bitbucket server account
ENV BITBUCKET_USERNAME <username>

# Your personal password to your bitbucket server account
ENV BITBUCKET_PASSWORD <password>

# Your Bitbucket Server host, excluding scheme
ENV BITBUCKET your.bitbucket.server.hostname

# The Bitbucket server API URL
ENV BITBUCKET_API $BITBUCKET/rest/api/1.0

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from
# your Bitbucket Server.
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT

EXPOSE $PORT

CMD ["broker", "--verbose"]
