ARG BASE_IMAGE=snyk/broker:base
ARG BROKER_TYPE=github-com


FROM ${BASE_IMAGE}

ARG BROKER_TYPE
ENV BROKER_TYPE=${BROKER_TYPE}

# Generate default accept filter
RUN broker init $BROKER_TYPE
# Support for OpenShift - have to run after init to get accept.json and .env
USER root
RUN chgrp -R 0 /home/node && chmod -R g=u,o= /home/node && chown -R node /home/node
USER node

EXPOSE $PORT

CMD ["broker", "--verbose"]
