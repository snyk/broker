#!/usr/bin/env bash
npm install
RC=$?
echo "NPM exited with code $RC"
if [[ $RC != 0 ]]; then
  ./debug.sh $RC
  exit $?
fi
