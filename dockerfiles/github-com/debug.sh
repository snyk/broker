#!/usr/bin/env bash
echo "Checking files"
NODE_MOD=/home/node/node_modules
if [[ -d "$NODE_MOD" ]]; then
  echo "Contents of $NODE_MOD"
  ls -la "$NODE_MOD"
else
  echo "Could not find directory $NODE_MOD"
fi

NODE_BIN="$NODE_MOD/.bin"
if [[ -d "$NODE_BIN" ]]; then
  echo "Contents of $NODE_BIN"
  ls -la "$NODE_BIN"
else
  echo "Could not find directory $NODE_BIN"
fi

BROKER_DIR="$NODE_MOD/snyk-broker"
if [[ -d "$BROKER_DIR" ]]; then
  echo "Contents of $BROKER_DIR"
  ls -la "$BROKER_DIR"
else
  echo "Could not find directory $BROKER_DIR"
fi

NODE_LOG="/home/node/.npm/_logs"
if [[ -d "$NODE_LOG" ]]; then
  echo "Dumping NPM logs"
  find "$NODE_LOG" -type f -exec bash -c 'file="$1"; echo "$file" && cat "$file"' bash {} \;
else
  echo "Could not find directory $NODE_LOG"
fi

# Assuming the script runs successfully, pass the NPM exit code back out
exit "$1"
