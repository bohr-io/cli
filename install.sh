#!/bin/bash

CURRENT_BRANCH_NAME="$(git branch --show-current)"

FILE_EXISTS=$(curl -o /dev/null --silent -Iw '%{http_code}' https://bohr-cli-packages.bohr.workers.dev/channels/$CURRENT_BRANCH_NAME/bohr-linux-x64-buildmanifest)

if [[ FILE_EXISTS -eq "200" ]]; then
  VERSION=$(curl -s "https://bohr-cli-packages.bohr.workers.dev/channels/$CURRENT_BRANCH_NAME/bohr-linux-x64-buildmanifest" | jq -r '.version')
  HASH=$(curl -s "https://bohr-cli-packages.bohr.workers.dev/channels/$CURRENT_BRANCH_NAME/bohr-linux-x64-buildmanifest" | jq -r '.sha')
else
  VERSION=$(curl -s "https://bohr-cli-packages.bohr.workers.dev/channels/main/bohr-linux-x64-buildmanifest" | jq -r '.version')
  HASH=$(curl -s "https://bohr-cli-packages.bohr.workers.dev/channels/main/bohr-linux-x64-buildmanifest" | jq -r '.sha')
fi

VERSION_ARR=(${VERSION//-/ })
VERSION_NUMBER=${VERSION_ARR[0]}

BOHR_CLI_DEB="bohr_$VERSION_NUMBER.$HASH-1_amd64.deb"

BOHR_CLI_DEB_URL="https://bohr-cli-packages.bohr.workers.dev/versions/$VERSION/$HASH/apt/$BOHR_CLI_DEB"
wget -nv $BOHR_CLI_DEB_URL
sudo dpkg --force-all -i $BOHR_CLI_DEB
