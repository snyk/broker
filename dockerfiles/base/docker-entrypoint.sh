#!/usr/bin/env bash

#------------------------------------------------------------------------------
# configuration variables
#------------------------------------------------------------------------------
set -o errexit    # abort script at first error
set -o pipefail   # return the exit status of the last command in the pipe
set -o nounset    # treat unset variables and parameters as an error


# Checks to see if this file is being run or sourced from another script
# https://unix.stackexchange.com/a/215279
function isSourced() {
  if [[ "${#FUNCNAME[@]}" -ge 2 ]] && \
     [[ "${FUNCNAME[0]}" == "isSourced" ]] && \
     [[ "${FUNCNAME[1]}" == "source" ]]; then
    return 0
  else
    return 1
  fi
}

# Checks and returns true (zero) if CR_TYPE environment variable is defined.
function isCraEnabled() {
  if [[ -n ${CR_TYPE:-} ]]; then
    return 0
  else
    return 1
  fi
}

# Loads and sets CR_CREDENTIALS environment variable needed for CRA.
#
# Note, if BROKER_CLIENT_VALIDATION_URL environment variable is configured,
# then CR_CREDENTIALS will be set as authorization header.
function loadCraCredentials() {
  if [[ -z "${CR_CREDENTIALS:-}" ]]; then
    local cr_json="{}"

    if [[ "${CR_TYPE:-}" == "ecr" || "${CR_TYPE:-}" == "ElasticCR" ]]; then
      cr_json=$(printf '{"type":"%s","roleArn":"%s","extra":{"region":"%s","externalId":"%s"}}\n' \
                       "${CR_TYPE:-}" \
                       "${CR_ROLE_ARN:-}" \
                       "${CR_REGION:-}" \
                       "${CR_EXTERNAL_ID:-}")
    elif [[ "${CR_TYPE:-}" == "digitalocean-cr" ]]; then
      cr_json=$(printf '{"type":"%s","username":"%s","password":"%s","registryBase":"%s"}\n' \
                       "${CR_TYPE:-}" \
                       "${CR_TOKEN:-}" \
                       "${CR_TOKEN:-}" \
                       "${CR_BASE:-}")
    else
      cr_json=$(printf '{"type":"%s","username":"%s","password":"%s","registryBase":"%s"}\n' \
                       "${CR_TYPE:-}" \
                       "${CR_USERNAME:-}" \
                       "${CR_PASSWORD:-}" \
                       "${CR_BASE:-}")
    fi

    CR_CREDENTIALS=$(echo "${cr_json}" | base64 -w 0)
    export CR_CREDENTIALS
  fi
  if [[ -n "${BROKER_CLIENT_VALIDATION_URL:-}" ]]; then
    BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER="${CR_CREDENTIALS}"
    export BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER
  fi
}

function main() {
  # if there are no args or first arg looks like a flag,
  # assume we want to run broker executable
  if [[ "$#" -eq 0 || "${1#-}" != "${1}" ]]; then
    set -- broker "$@"
  fi

  if [[ "$1" == "broker" ]]; then
    if isCraEnabled; then
      loadCraCredentials
    fi
  fi

  exec "$@"
}

#------------------------------------------------------------------------------
# SCRIPT ENTRYPOINT
#------------------------------------------------------------------------------
if ! isSourced; then
  main "$@"
fi
