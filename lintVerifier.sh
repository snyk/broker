#! /usr/bin/env bash

set -eo pipefail

echo "Linting JSON files..."
# shellcheck disable=SC2044
for file in $(find ./client-templates -type f -name '*.json.sample'); do
    echo "${file}"
    node -r "fs" -e "JSON.parse(fs.readFileSync('${file}'))"
done
