FROM node:12-buster-slim

MAINTAINER Snyk Ltd

RUN npm install --global snyk-broker

RUN apt-get update && apt-get install -y ca-certificates

# Don't run as root
WORKDIR /home/node
USER node

# Generate default accept filter
RUN broker init container-registry-agent



######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique broker identifier, copied from snyk.io org settings page
ENV BROKER_TOKEN <broker-token>

# The URL of your broker client (including scheme and port), used by container
# registry agent to call back to Snyk through brokered connection
ENV BROKER_CLIENT_URL "https://<broker-client-host>:<broker-client-port>"

# The URL of your container registry agent
ENV CR_AGENT_URL <agent-host>:<agent-port>

# Base64-encoded credentials json used to access container registry via agent
ENV CR_CREDENTIALS <base64-encoded-credentials-json>

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

EXPOSE $PORT

CMD ["broker", "--verbose"]
