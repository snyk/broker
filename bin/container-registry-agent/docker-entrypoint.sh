#!/bin/ash

# ensure correct exit status in case of error
set -e
set -o pipefail


# Build and set CR_CREDENTIALS unless already set
if [[ -z "$CR_CREDENTIALS" ]]; then
  if [[ "$CR_TYPE" == "ElasticCR" || "$CR_TYPE" == "ecr" ]]; then
    FORMAT='{"type":"%s","roleArn":"%s","extra":{"region":"%s","externalId":"%s"}}\n'
    JSON=$(printf "$FORMAT" "$CR_TYPE" "$CR_ROLE_ARN" "$CR_REGION" "$CR_EXTERNAL_ID")
  elif [[ "$CR_TYPE" == "digitalocean-cr" ]]; then
    FORMAT='{"type":"%s", "username":"%s", "password":"%s", "registryBase":"%s"}\n'
    JSON=$(printf "$FORMAT" "$CR_TYPE" "$CR_TOKEN" "$CR_TOKEN" "$CR_BASE")
  else
    FORMAT='{"type":"%s", "username":"%s", "password":"%s", "registryBase":"%s"}\n'
    JSON=$(printf "$FORMAT" "$CR_TYPE" "$CR_USERNAME" "$CR_PASSWORD" "$CR_BASE")
  fi

  export CR_CREDENTIALS=$(echo $JSON | base64 -w0)
fi
if [[ $BROKER_CLIENT_VALIDATION_URL ]]; then
  export BROKER_CLIENT_VALIDATION_AUTHORIZATION_HEADER=$CR_CREDENTIALS
fi

# execute main command
exec "$@"
