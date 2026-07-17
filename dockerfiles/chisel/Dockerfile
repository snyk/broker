ARG BASE_IMAGE=ubuntu:24.04
ARG UBUNTU_RELEASE=24.04
ARG CHISEL_VERSION=v1.1.0
ARG NODE_VERSION=24.17.0

FROM ${BASE_IMAGE} AS node-base

ARG NODE_VERSION
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=${NODE_VERSION}
ENV PATH=$PATH:/home/node/snyk-broker/bin
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
      libatomic1 \
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
      5BE8A3F6C8A5C01D106C0AD820B1A390B168D356 \
      DD792F5973C6DE52C432CBDAC77ABFA00DDBF2B7 \
      CC68F5A3106FF448322E48ED27F5E38D5B0A215F \
      8FCCA13FEF1D0C2E91008E09770F7A9A5AE15600 \
      890C08DB8579162FEE0DF9DB8BEAB4DFCF555EF4 \
      C82FA3AE1CBEDC6BE46B9360C43CEC45C17AB93C \
      108F52B48DB57BB0CC439B2997B01419BD92F80A \
      A363A499291CBBC940DD62E41F10027AF002F8B0 \
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
    npm cache clean --force
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

USER root
RUN <<EOF
  apt update
  apt install --assume-yes ca-certificates
EOF

USER node
WORKDIR /home/node/snyk-broker/
COPY --chown=node:node . /home/node/snyk-broker/
RUN <<EOF
  set -ex
  NODE_ENV=development npm ci
  npm run build
  npm run prepare:templates
  # remove extraneous packages
  NODE_ENV=production npm prune
  # symlink for broker (with executable flag)
  mkdir -p /home/node/snyk-broker/bin/
  ln -sf /home/node/snyk-broker/dist/cli/index.js /home/node/snyk-broker/bin/broker
  chmod +x /home/node/snyk-broker/dist/cli/index.js

  # removing non-used (transitive) dependencies to fix vulnerabilities
  rm -rf /home/node/snyk-broker/node_modules/setheader/node_modules/debug
EOF


# Chisel slicer stage
FROM ubuntu:${UBUNTU_RELEASE} AS chisel-builder
ARG TARGETARCH UBUNTU_RELEASE CHISEL_VERSION
ARG USER_UID=1000
ARG USER_GID=${USER_UID}
SHELL ["/bin/bash", "-oeux", "pipefail", "-c"]

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

ADD "https://github.com/canonical/chisel/releases/download/${CHISEL_VERSION}/chisel_${CHISEL_VERSION}_linux_${TARGETARCH}.tar.gz" \
    chisel.tar.gz
RUN tar -xvf chisel.tar.gz -C /usr/bin/

# we cut the chisel release into its own rootfs
RUN mkdir /staging-rootfs \
    && chisel cut --release "ubuntu-$UBUNTU_RELEASE" --root /staging-rootfs \
        base-files_base \
        base-files_release-info \
        base-files_chisel \
        bash_bins \
        coreutils_bins \
        libc6_libs \
        libgcc-s1_libs \
        libstdc++6_libs \
        ca-certificates_data

# manually symlink sh to bash
RUN ln -s /bin/bash /staging-rootfs/bin/sh

RUN userdel -r ubuntu \
    && groupadd --gid ${USER_GID} node \
    && useradd --uid ${USER_UID} --gid node --shell /bin/bash --create-home node

RUN cp /etc/passwd /etc/group /staging-rootfs/etc \
    && install -o node -g node -d /staging-rootfs/home/node/snyk-broker

FROM scratch

COPY --from=chisel-builder /staging-rootfs /
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
COPY --from=node-base /usr/local/bin/nodejs /usr/local/bin/nodejs
COPY --from=broker-builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=broker-builder --chown=node:node /home/node/snyk-broker/bin /home/node/snyk-broker/bin
COPY --from=broker-builder --chown=node:node /home/node/snyk-broker/dist /home/node/snyk-broker/dist
COPY --from=broker-builder --chown=node:node /home/node/snyk-broker/node_modules /home/node/snyk-broker/node_modules
COPY --chown=node:node config.default.json /home/node/config.default.json
COPY --chown=node:node defaultFilters /home/node/defaultFilters

ENV PATH=/usr/local/bin:/usr/bin:/bin:/home/node/snyk-broker/bin
WORKDIR /home/node
USER node
