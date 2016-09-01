#!/bin/bash
set -e
echo "Travis after success build"
if [ "$TRAVIS_PULL_REQUEST" != "false" ]; then
  exit 0
fi
if [ "$TRAVIS_BRANCH" == "develop" ]; then
  export SUCCESS_URL="${DEVELOP_SUCCESS_URL}"
elif [ "$TRAVIS_BRANCH" == "master" ]; then
  export SUCCESS_URL="${MASTER_SUCCESS_URL}"
else
  exit 0
fi

export COMMIT_MESSAGE=`git log -n 1 --format='commit %h %s'`
export COMMIT_HASH=${TRAVIS_COMMIT}

echo "Success trigger on $TRAVIS_BRANCH for $TRAVIS_COMMIT"

curl -i -H "Accept: application/json" -H "Content-Type: application/json" -X POST -d "{\"commit_msg\":\"${COMMIT_MESSAGE}\", \"commit_hash\":\"${COMMIT_HASH}\"}" $SUCCESS_URL
