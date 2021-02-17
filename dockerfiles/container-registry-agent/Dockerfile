FROM snyk/ubuntu as base

MAINTAINER Snyk Ltd

USER root

RUN apt update && apt install -y make python gcc

RUN apt-get update && apt-get install -y ca-certificates

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

ENV PATH=$PATH:/home/node/.npm-global/bin 

RUN npm install --global snyk-broker 



FROM snyk/ubuntu

ENV PATH=$PATH:/home/node/.npm-global/bin 

COPY --from=base /home/node/.npm-global /home/node/.npm-global

COPY --from=base /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

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
