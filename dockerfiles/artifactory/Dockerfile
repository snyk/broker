ARG BASE_IMAGE=snyk/broker:base


FROM ${BASE_IMAGE}

# Generate default accept filter
RUN broker init artifactory
# Support for OpenShift - have to run after init to get accept.json and .env
USER root
RUN chgrp -R 0 /home/node && chmod -R g=u,o= /home/node && chown -R node /home/node
USER node

######################################
# Custom Broker Client configuration #
# Redefine in derived Dockerfile,    #
# or provide as runtime args `-e`    #
######################################

# Your unique Broker identifier
# ENV BROKER_TOKEN <broker-token>

# Your Artifactory URL to artifactory
# NOTA BENE: without `/` character in the end of URL
# ENV ARTIFACTORY_URL <yourdomain>.artifactory.com/artifactory

# Provide RES_BODY_URL_SUB with the URL of the artifactory without credentials and http protocol
# This URL substitution is required for NPM integration
# ENV RES_BODY_URL_SUB=http://<yourdomain>.artifactory.com/artifactory

# The port used by the broker client to accept internal connections
# Default value is 7341
# ENV PORT 7341

# The URL of your broker client (including scheme and port)
# This will be used as the webhook payload URL coming in from Jira
# ENV BROKER_CLIENT_URL http://<broker.client.hostname>:$PORT

EXPOSE $PORT

CMD ["broker", "--verbose"]
