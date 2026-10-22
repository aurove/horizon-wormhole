#!/usr/bin/env bash
set -euo pipefail

# The upstream release tag and the CLI package version use different numbers.
NTT_CLI_TAG="v1.10.0+cli"
NTT_CLI_PACKAGE_VERSION="1.7.0"

command -v node >/dev/null 2>&1 || {
  echo "Install Node.js before installing the NTT CLI; see Wormhole's NTT setup guide." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "Install npm before installing the NTT CLI; see Wormhole's NTT setup guide." >&2
  exit 1
}
command -v bun >/dev/null 2>&1 || {
  echo "Install Bun v1.2.23 and add its binary directory to PATH: https://bun.sh/docs/installation" >&2
  exit 1
}
if [[ "$(bun --version)" != "1.2.23" ]]; then
  echo "Wormhole's NTT CLI install process requires Bun v1.2.23; found $(bun --version)." >&2
  exit 1
fi

# Follow Wormhole's documented installer invocation, then verify its selected
# release tag is the one validated by Horizon.
installer="https://raw.githubusercontent.com/wormhole-foundation/native-token-transfers/main/cli/install.sh"
curl -fsSL "$installer" | bash

installed_tag="$(git -C "$HOME/.ntt-cli/.checkout" describe --tags --exact-match HEAD)"
if [[ "$installed_tag" != "$NTT_CLI_TAG" ]]; then
  echo "Expected NTT CLI source tag ${NTT_CLI_TAG}; found: ${installed_tag}" >&2
  exit 1
fi

installed_version="$(ntt --version)"
case "$installed_version" in
  "ntt v${NTT_CLI_PACKAGE_VERSION} ("*|"ntt v${NTT_CLI_PACKAGE_VERSION}+"*) ;;
  *)
    echo "Expected NTT CLI package v${NTT_CLI_PACKAGE_VERSION}; found: $installed_version" >&2
    exit 1
    ;;
esac

echo "Installed NTT CLI source tag ${NTT_CLI_TAG} (${installed_version})"
