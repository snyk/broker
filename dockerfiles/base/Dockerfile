ARG BASE_IMAGE=ubuntu:24.04
ARG NODE_VERSION=20.19.0


FROM ${BASE_IMAGE} AS node-base

ARG NODE_VERSION
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=${NODE_VERSION}
ENV PATH=$PATH:/home/node/.npm-global/bin
ARG USER_UID=1000
ARG USER_GID=${USER_UID}

RUN <<EOF
    set -ex
    # remove ubuntu user with user id 1000
    touch /var/mail/ubuntu && chown ubuntu /var/mail/ubuntu && userdel -r ubuntu
    groupadd --gid ${USER_GID} node
    useradd --uid ${USER_UID} --gid node --shell /bin/bash --create-home node
    apt update
    apt upgrade --assume-yes
    # install packages needed for node installation
    # keep it in alphabetical order
    apt install --assume-yes \
      curl \
      gpg \
      xz-utils
    # install node
    ARCH= && dpkgArch="$(dpkg --print-architecture)"
    case "${dpkgArch##*-}" in \
      amd64) ARCH='x64';; \
      ppc64el) ARCH='ppc64le';; \
      s390x) ARCH='s390x';; \
      arm64) ARCH='arm64';; \
      armhf) ARCH='armv7l';; \
      i386) ARCH='x86';; \
      *) echo "unsupported architecture"; exit 1 ;; \
    esac
    # gpg keys listed at https://github.com/nodejs/node#release-keys
    for key in \
      4ED778F539E3634C779C87C6D7062848A1AB005C \
      141F07595B7B3FFE74309A937405533BE57C7D57 \
      74F12602B6F1C4E913FAA37AD3A89613643B6201 \
      DD792F5973C6DE52C432CBDAC77ABFA00DDBF2B7 \
      CC68F5A3106FF448322E48ED27F5E38D5B0A215F \
      61FC681DFB92A079F1685E77973F295594EC4689 \
      8FCCA13FEF1D0C2E91008E09770F7A9A5AE15600 \
      C4F0DFFF4E8C1A8236409D08E73BC641CC11F4C8 \
      890C08DB8579162FEE0DF9DB8BEAB4DFCF555EF4 \
      C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C \
      108F52B48DB57BB0CC439B2997B01419BD92F80A \
      A363A499291CBBC940DD62E41F10027AF002F8B0 \
      C0D6248439F1D5604AAFFB4021D900FFDB233756 \
    ; do \
      gpg --batch --keyserver hkp://keys.openpgp.org --recv-keys "$key" || \
      gpg --batch --keyserver hkp://pgp.mit.edu --recv-keys "$key" || \
      gpg --batch --keyserver hkp://keyserver.ubuntu.com --recv-keys "$key" ; \
    done
    curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz"
    curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt.asc"
    gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc
    grep " node-v$NODE_VERSION-linux-$ARCH.tar.xz\$" SHASUMS256.txt | sha256sum -c -
    tar -xJf "node-v$NODE_VERSION-linux-$ARCH.tar.xz" -C /usr/local --strip-components=1 --no-same-owner
    rm "node-v$NODE_VERSION-linux-$ARCH.tar.xz" SHASUMS256.txt.asc SHASUMS256.txt
    ln -s /usr/local/bin/node /usr/local/bin/nodejs
    # smoke tests to verify node and npm installation
    node --version
    npm --version
    # update npm to the latest version globally
    npm install --global npm@latest
    npm --version
    # remove non-needed packages and clean apt cache
    apt remove --assume-yes \
      curl \
      gpg \
      libsqlite3-0 \
      xz-utils
    apt autoremove --assume-yes --purge
    rm -rf /var/lib/apt/lists/*
EOF



FROM node-base AS broker-builder

ARG NODE_VERSION
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH=$PATH:/home/node/.npm-global/bin

USER root

RUN apt update && \
    apt install --assume-yes ca-certificates
RUN npm install --global snyk-broker

# removing non-used (transitive) dependencies to fix vulnerabilities
RUN rm -rf /home/node/.npm-global/lib/node_modules/snyk-broker/node_modules/setheader/node_modules/debug



FROM node-base

ARG BROKER_VERSION

LABEL org.opencontainers.image.authors="hybrid" \
      org.opencontainers.image.documentation="https://docs.snyk.io/enterprise-setup/snyk-broker" \
      org.opencontainers.image.ref.name="snyk-broker" \
      org.opencontainers.image.source="https://github.com/snyk/broker" \
      org.opencontainers.image.vendor="Snyk, Ltd." \
      org.opencontainers.image.version="${BROKER_VERSION:-local}" \
      io.snyk.containers.image.dockerfile="/dockerfiles/base/Dockerfile"

COPY --from=broker-builder /home/node/.npm-global /home/node/.npm-global
COPY --from=broker-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY config.default.json /home/node/config.default.json
COPY defaultFilters /home/node/defaultFilters

WORKDIR /home/node
USER node
