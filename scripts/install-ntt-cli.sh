#!/usr/bin/env bash
set -euo pipefail

# Keep this aligned with the CLI release validated by the Horizon NTT setup.
NTT_CLI_TAG="v1.10.0+cli"

command -v bun >/dev/null 2>&1 || {
  echo "Install Bun v1.2.23 before installing the NTT CLI: https://bun.sh/docs/installation" >&2
  exit 1
}
if [[ "$(bun --version)" != "1.2.23" ]]; then
  echo "This setup pins Bun v1.2.23; found $(bun --version)." >&2
  exit 1
fi

installer="https://raw.githubusercontent.com/wormhole-foundation/native-token-transfers/${NTT_CLI_TAG}/cli/install.sh"
curl -fsSL "$installer" | bash -s -- --branch "$NTT_CLI_TAG"

if ! ntt --version | grep -Fq '1.10.0'; then
  echo "Installed NTT CLI version does not match the pinned v1.10.0+cli release." >&2
  exit 1
fi

echo "Installed pinned NTT CLI v1.10.0+cli"
