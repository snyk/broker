#!/usr/bin/env bash
set -ex

pushd "$(dirname "$0")" &>/dev/null || exit 1

function cleanup() {
  if [[ -n "$PF_PID" ]]; then
    kill "$PF_PID"
  fi
  if [[ -n "$NC_PID" ]]; then
    kill "$NC_PID"
  fi
}

trap 'cleanup' EXIT

kubectl port-forward pod/"$(kubectl get pods | grep "broker-snyk-server-v2-k6-" | tail -n 1 | awk '{ print $1 }')" 9999 &
PF_PID=$!

kubectl exec -it pod/"$(kubectl get pods | grep "broker-snyk-server-v2-k6-" | tail -n 1 | awk '{ print $1 }')" -- sh -c 'nc -l -p 9999 127.0.0.1 > script.js' &
NC_PID=$!

echo "Waiting for port-forwarding and NC to come up - if this doesn't work you might need to sleep for longer"
sleep 3

nc localhost 9999 <basic.js
