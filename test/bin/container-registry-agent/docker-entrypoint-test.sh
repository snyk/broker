#!/bin/bash

testCredentialsAreUnchangedIfAlreadySet() {
  CR_CREDENTIALS="already set"
  CR_TYPE="DockerHub"
  CR_USERNAME="user"
  CR_PASSWORD="pass"
  CR_BASE="cr.com/my"

  . ../../bin/container-registry-agent/docker-entrypoint.sh

  assertEquals "${CR_CREDENTIALS}" "already set"
}

testEcrCredentialsSetup() {
  CR_TYPE="ecr"
  CR_ROLE_ARN="arn:role:..."
  CR_REGION="eu-west-3"
  CR_EXTERNAL_ID="1234567890"
  unset CR_CREDENTIALS

  . ../../bin/container-registry-agent/docker-entrypoint.sh

  EXPECTED='{"type":"ecr","roleArn":"arn:role:...","extra":{"region":"eu-west-3","externalId":"1234567890"}}'
  assertEquals "$(echo ${CR_CREDENTIALS} | base64 -d)" "$EXPECTED"
}

testDigitalOceanCredentialsSetup() {
  CR_TYPE="digitalocean-cr"
  CR_TOKEN="token"
  CR_BASE="cr.com/my"
  unset CR_CREDENTIALS

  . ../../bin/container-registry-agent/docker-entrypoint.sh

  EXPECTED='{"type":"digitalocean-cr", "username":"token", "password":"token", "registryBase":"cr.com/my"}'
  assertEquals  "$EXPECTED" "$(echo ${CR_CREDENTIALS} | base64 -d)"
}

testStandardCredentialsSetup() {
  CR_TYPE="DockerHub"
  CR_USERNAME="user"
  CR_PASSWORD="pass"
  CR_BASE="cr.com/my"
  unset CR_CREDENTIALS

  . ../../bin/container-registry-agent/docker-entrypoint.sh

  EXPECTED='{"type":"DockerHub", "username":"user", "password":"pass", "registryBase":"cr.com/my"}'
  assertEquals "$(echo ${CR_CREDENTIALS} | base64 -d)" "$EXPECTED"
}

. ./shunit2
