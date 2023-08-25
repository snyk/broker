#!/usr/bin/env bash

# set name of the dev/* branch in package.json
GIT_BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
GIT_COMMIT_HASH=$(git rev-parse HEAD)
echo "=> Git branch name: $GIT_BRANCH_NAME"
echo "=> Git commit hash: $GIT_COMMIT_HASH"

echo "=> Generated package.json"
sed "s|{BRANCH_NAME}|${GIT_BRANCH_NAME}|g" package.json.tmpl > package.json
cat package.json

echo "=> Generated metadata.json"
sed -e "s|{BRANCH_NAME}|${GIT_BRANCH_NAME}|g" -e "s|{COMMIT_HASH}|${GIT_COMMIT_HASH}|g" metadata.json.tmpl > metadata.json
cat metadata.json
