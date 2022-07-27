FROM snyk/ubuntu as base

MAINTAINER Snyk Ltd

USER root

RUN apt-get update && apt-get install -y ca-certificates

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

ENV PATH=$PATH:/home/node/.npm-global/bin

RUN npm install --global snyk-broker



FROM snyk/ubuntu

ENV PATH=$PATH:/home/node/.npm-global/bin

COPY --from=base /home/node/.npm-global /home/node/.npm-global

COPY --from=base /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# On Openshift it's required that all files are owned by the root
# group, and with all perms set. This is because the images run with a
# randomly assigned user id, but part of the root group. See
# https://docs.openshift.com/container-platform/4.9/openshift_images/create-images.html#images-create-guide-openshift_create-images
RUN chgrp -R 0 /home/node && chmod -R g=u /home/node

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
# ENV BROKER_TOKEN <broker-token>

# Your personal username to your bitbucket server account
# ENV BITBUCKET_USERNAME <username>

# Your personal password to your bitbucket server account
# ENV BITBUCKET_PASSWORD <password>

# Your Bitbucket Server host, excluding scheme
# ENV BITBUCKET your.bitbucket.server.hostname

# The Bitbucket server API URL
# ENV BITBUCKET_API $BITBUCKET/rest/api/1.0

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from
# your Bitbucket Server.
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT

EXPOSE $PORT

CMD ["broker", "--verbose"]
