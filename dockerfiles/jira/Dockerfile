FROM node:8-slim

MAINTAINER Snyk Ltd

# Install broker
RUN npm install --global snyk-broker

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init jira



######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique broker identifier
ENV BROKER_TOKEN <broker-token>

# Your personal credentials to your jira
ENV JIRA_USERNAME <username>
ENV JIRA_PASSWORD <password>

# Your Jira Server URL, including scheme and hostname
ENV JIRA_BASE_URL https://your.jira.server.hostname

# The port used by the broker client to accept internal connections
# Default value is 7341
ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from Jira
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT


#######################################
# Generic Broker Client configuration #
#######################################


# The URL of the Snyk broker server
ENV BROKER_SERVER_URL https://broker.snyk.io

# The fine detail accept rules that allow Snyk to make API requests to your
# Jira instance
ENV ACCEPT accept.json

# The path for the broker's internal healthcheck URL. Must start with a '/'.
ENV BROKER_HEALTHCHECK_PATH /healthcheck


EXPOSE $PORT

HEALTHCHECK --interval=10s --timeout=1s \
  CMD wget -q --spider http://localhost:${PORT}${BROKER_HEALTHCHECK_PATH}

CMD ["broker", "--verbose"]
