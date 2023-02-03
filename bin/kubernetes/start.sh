#!/usr/bin/env bash

DEFAULT_K8S_SERVICE_ACCOUNT_TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)

if [ -z "$CA_CERT" ] && [ -f "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt" ];
then
  export CA_CERT=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
fi

export K8S_SERVICE_ACCOUNT_TOKEN="${K8S_SERVICE_ACCOUNT_TOKEN:-$DEFAULT_K8S_SERVICE_ACCOUNT_TOKEN}"

if [ -z "$K8S_SERVICE_ACCOUNT_TOKEN" ]
then
      echo "A kubernetes token must be provided, either in a file at /var/run/secrets/kubernetes.io/serviceaccount/token or in an environment variable K8S_SERVICE_ACCOUNT_TOKEN"
      exit 1
fi

broker --verbose
