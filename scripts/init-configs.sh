#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
command -v ntt >/dev/null 2>&1 || {
  echo "NTT CLI is required. Run scripts/install-ntt-cli.sh first." >&2
  exit 1
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

init_config() {
  local network="$1"
  local destination="$2"
  if [[ -e "$PACKAGE_DIR/$destination" ]]; then
    echo "Keeping existing $destination"
    return
  fi

  local staging="$tmp_dir/$network"
  mkdir -p "$staging" "$(dirname "$PACKAGE_DIR/$destination")"
  (
    cd "$staging"
    ntt init "$network"
  )
  test -f "$staging/deployment.json" || {
    echo "ntt init $network did not create deployment.json" >&2
    exit 1
  }
  cp "$staging/deployment.json" "$PACKAGE_DIR/$destination"
  echo "Created $destination"
}

init_config Testnet vaults/avBTCv/testnet/deployment.json
init_config Mainnet vaults/avBTCv/mainnet/deployment.json
init_config Testnet vaults/avMEZOv/testnet/deployment.json
init_config Mainnet vaults/avMEZOv/mainnet/deployment.json
