#!/bin/bash

# ensure correct exit status in case of error
set -e
set -o pipefail


# Build and set CR_CREDENTIALS unless already set
if [[ -z "$CR_CREDENTIALS" ]]; then
  if [[ "$CR_TYPE" == "ElasticCR" || "$CR_TYPE" == "ecr" ]]; then
    FORMAT='{"type":"%s","roleArn":"%s","extra":{"region":"%s","externalId":"%s"}}\n'
    JSON=$(printf "$FORMAT" "$CR_TYPE" "$CR_ROLE_ARN" "$CR_REGION" "$CR_EXTERNAL_ID")
  else
    FORMAT='{"type":"%s", "username":"%s", "password":"%s", "registryBase":"%s"}\n'
    JSON=$(printf "$FORMAT" "$CR_TYPE" "$CR_USERNAME" "$CR_PASSWORD" "$CR_BASE")
  fi

  export CR_CREDENTIALS=$(echo $JSON | base64 -w0)
fi

# execute main command
exec "$@"
