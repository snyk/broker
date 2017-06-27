FROM node:6-slim

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
ENV PORT 7341


#######################################
# Generic Broker Client configuration #
#######################################


# The URL of the Snyk broker server
ENV BROKER_SERVER_URL https://broker.snyk.io

# The fine detail accept rules that allow Snyk to make API requests to your
# Bitbucket Server instance
ENV ACCEPT accept.json




HEALTHCHECK --interval=10s --timeout=1s \
  CMD wget -q --spider http://localhost:$PORT/healthcheck

CMD ["broker", "--verbose"]
