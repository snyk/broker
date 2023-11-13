ARG BASE_IMAGE=snyk/broker:base


FROM ${BASE_IMAGE}

ARG BROKER_TYPE

# Prepare image entrypoint
COPY ./bin/container-registry-agent/docker-entrypoint.sh ./docker-entrypoint.sh
# Generate default accept filter
RUN broker init container-registry-agent
# Support for OpenShift - have to run after init to get accept.json and .env
USER root
RUN chgrp -R 0 /home/node && chmod -R g=u,o= /home/node && chown -R node /home/node
USER node

ENV NODE_EXTRA_CA_CERTS=${CA_CERT}

EXPOSE $PORT

ENTRYPOINT ["/home/node/docker-entrypoint.sh"]

CMD ["broker", "--verbose"]
