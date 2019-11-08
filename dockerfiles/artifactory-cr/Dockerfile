FROM node:8-slim

MAINTAINER Snyk Ltd

# Install broker
RUN npm install --global snyk-broker

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init artifactory-cr



######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique Broker identifier
ENV BROKER_TOKEN <broker-token>

# Your personal credentials to your Artifactory Container Registry
ENV ARTIFACTORYCR_USERNAME <username>
ENV ARTIFACTORYCR_PASSWORD <password>

# Your Artifactory Container Registry host
ENV ARTIFACTORYCR_HOSTNAME your.artifactory.cr.hostname

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from Jira
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT

EXPOSE $PORT

CMD ["broker", "--verbose"]
