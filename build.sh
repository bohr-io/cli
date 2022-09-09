#!/bin/bash

cd cli
#delete .git folder
rm -rf .git

# get hash on root of monorepo
CLI_COMMIT_HASH="$(git rev-parse --short HEAD)"
CURRENT_BRANCH_NAME="$(git branch --show-current)"

#get current version on package
CURRENT_CLI_VERSION=$(node --eval="process.stdout.write(require('./package.json').version)")

#change package version
if [[ "$CURRENT_BRANCH_NAME" != "main" || "$CURRENT_BRANCH_NAME" != "dev" ]]; then
  tmp=$(mktemp)
  jq ".version=\"$CURRENT_CLI_VERSION-$CURRENT_BRANCH_NAME\"" package.json > "$tmp" && mv "$tmp" package.json
fi

rm -rf tmp && rm -rf dist && npx tsc -b && npx oclif manifest && npx oclif readme

npx oclif pack tarballs --targets=linux-x64
npx oclif upload tarballs --targets=linux-x64

if [[ "$CURRENT_BRANCH_NAME" != "main" || "$CURRENT_BRANCH_NAME" != "dev" ]]; then
  npx oclif promote --targets=linux-x64 --version $CURRENT_CLI_VERSION-$CURRENT_BRANCH_NAME --sha $CLI_COMMIT_HASH --channel $CURRENT_BRANCH_NAME
else
  npx oclif promote --targets=linux-x64 --version $CURRENT_CLI_VERSION --sha $CLI_COMMIT_HASH
fi

if [[ "$CURRENT_BRANCH_NAME" != "main" || "$CURRENT_BRANCH_NAME" != "dev" ]]; then
  tmp=$(mktemp)
  jq ".version=\"$CURRENT_CLI_VERSION-$CURRENT_BRANCH_NAME\"" package.json > "$tmp" && mv "$tmp" package.json
fi

rm -rf tmp && rm -rf dist && npx tsc -b && npx oclif manifest && npx oclif readme

npx oclif pack deb
npx oclif upload deb

if [[ "$CURRENT_BRANCH_NAME" != "main" || "$CURRENT_BRANCH_NAME" != "dev" ]]; then
  tmp=$(mktemp)
  jq ".version=\"$CURRENT_CLI_VERSION\"" package.json > "$tmp" && mv "$tmp" package.json
fi
