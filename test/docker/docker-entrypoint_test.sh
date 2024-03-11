#!/usr/bin/env bash

# ShellCheck is unable to follow dynamic paths, so we disable this check.
# shellcheck disable=SC1091


SCRIPT_DIR="$(dirname "$0")"
readonly SCRIPT_DIR


test_isCraEnabled_shouldReturnFalse_ifCraTypeEnvUndefined() {
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  isCraEnabled
  ACTUAL=$?

  assertEquals "${ACTUAL}" 1
}

test_isCraEnabled_shouldReturnFalse_ifCraTypeEnvEmptyString() {
  export CR_TYPE=""
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  isCraEnabled
  ACTUAL=$?

  assertEquals "${ACTUAL}" 1
}

test_isCraEnabled_shouldReturnTrue_ifCraTypeEnvDefined() {
  export CR_TYPE="DockerHub"
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  isCraEnabled
  ACTUAL=$?

  assertEquals "${ACTUAL}" 0
}

test_loadCraCredentials_shouldNotChangeCredentials_ifCrCredentialsEnvDefined() {
  export CR_CREDENTIALS="already set"
  export CR_TYPE="DockerHub"
  export CR_USERNAME="user"
  export CR_PASSWORD="pass"
  export CR_BASE="cr.com/my"
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  loadCraCredentials

  assertEquals "already set" "${CR_CREDENTIALS}"
}

test_loadCraCredentials_shouldFormatEcrCredentials_ifCrTypeEnvEcr() {
  export CR_TYPE="ecr"
  export CR_ROLE_ARN="arn:role:..."
  export CR_REGION="eu-west-3"
  export CR_EXTERNAL_ID="1234567890"
  unset CR_CREDENTIALS
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  loadCraCredentials

  EXPECTED='{"type":"ecr","roleArn":"arn:role:...","extra":{"region":"eu-west-3","externalId":"1234567890"}}'
  assertEquals "${EXPECTED}" "$(echo "${CR_CREDENTIALS}" | base64 -d)"
}

test_loadCraCredentials_shouldFormatElasticCrCredentials_ifCrTypeEnvElasticCr() {
  export CR_TYPE="ElasticCR"
  export CR_ROLE_ARN="arn:role:..."
  export CR_REGION="eu-west-3"
  export CR_EXTERNAL_ID="1234567890"
  unset CR_CREDENTIALS
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  loadCraCredentials

  EXPECTED='{"type":"ElasticCR","roleArn":"arn:role:...","extra":{"region":"eu-west-3","externalId":"1234567890"}}'
  assertEquals "${EXPECTED}" "$(echo "${CR_CREDENTIALS}" | base64 -d)"
}

test_loadCraCredentials_shouldFormatDigitalOceanCredentials_ifCrTypeEnvDigitalOcean() {
  export CR_TYPE="digitalocean-cr"
  export CR_TOKEN="token"
  export CR_BASE="cr.com/my"
  unset CR_CREDENTIALS
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  loadCraCredentials

  EXPECTED='{"type":"digitalocean-cr","username":"token","password":"token","registryBase":"cr.com/my"}'
  assertEquals "${EXPECTED}" "$(echo "${CR_CREDENTIALS}" | base64 -d)"
}

test_loadCraCredentials_shouldFormatStandardCredentials_ifCrTypeEnvDockerHub() {
  export CR_TYPE="DockerHub"
  export CR_USERNAME="user"
  export CR_PASSWORD="pass"
  export CR_BASE="cr.com/my"
  unset CR_CREDENTIALS
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  loadCraCredentials

  EXPECTED='{"type":"DockerHub","username":"user","password":"pass","registryBase":"cr.com/my"}'
  assertEquals "${EXPECTED}" "$(echo "${CR_CREDENTIALS}" | base64 -d)"
}

test_loadCraCredentials_shouldSetAuthorizationHeader_ifClientValidationUrlDefined() {
  export CR_TYPE="DockerHub"
  export CR_USERNAME="user"
  export CR_PASSWORD="pass"
  export CR_BASE="cr.com/my"
  export BROKER_CLIENT_VALIDATION_URL="http://dra.url/systemcheck"
  unset CR_CREDENTIALS
  unset BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  loadCraCredentials

  EXPECTED='{"type":"DockerHub","username":"user","password":"pass","registryBase":"cr.com/my"}'
  assertEquals "${EXPECTED}" "$(echo "${BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER}" | base64 -d)"
}

test_loadCraCredentials_shouldNotSetAuthorizationHeader_ifClientValidationUrlUndefined() {
  export CR_TYPE="DockerHub"
  export CR_USERNAME="user"
  export CR_PASSWORD="pass"
  export CR_BASE="cr.com/my"
  unset CR_CREDENTIALS
  unset BROKER_CLIENT_VALIDATION_URL
  unset BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER
  source "${SCRIPT_DIR}/../../dockerfiles/base/docker-entrypoint.sh"

  loadCraCredentials

  assertEquals "" "$(echo "${BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER:-}" | base64 -d)"
}


# Load and run shUnit2.
source "${SCRIPT_DIR}/../shunit2"
