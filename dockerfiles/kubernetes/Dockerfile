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
# RUN broker init kubernetes
COPY ./client-templates/kubernetes/accept.json.sample /home/node/accept.json
ENV ACCEPT=/home/node/accept.json

COPY  ./bin/kubernetes/start.sh /home/node/start.sh
ENV CLUSTER_ENDPOINT=https://kubernetes.default

EXPOSE $PORT
CMD ["/home/node/start.sh"]

