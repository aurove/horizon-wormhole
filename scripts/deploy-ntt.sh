#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: pnpm ntt:deploy -- <avBTCv|avMEZOv> <testnet|mainnet> <MEZO_VAULT_TOKEN> <SPOKE_PEER_TOKEN>" >&2
  echo "Set ETH_PRIVATE_KEY and CONFIRM_NTT_DEPLOYMENT=YES. Mainnet also requires CONFIRM_MAINNET_NTT_DEPLOYMENT=YES." >&2
}

if [[ $# -ne 4 ]]; then
  usage
  exit 2
fi

symbol="$1"
network="$2"
hub_token="$3"
spoke_token="$4"

case "$symbol" in
  avBTCv) target="avBTCv" ;;
  avMEZOv) target="avMEZOv" ;;
  *) usage; echo "Unsupported vault share: $symbol" >&2; exit 2 ;;
esac

case "$network" in
  testnet)
    hub_chain="Mezo"
    spoke_chain="BaseSepolia"
    ;;
  mainnet)
    hub_chain="Mezo"
    spoke_chain="Base"
    if [[ "${CONFIRM_MAINNET_NTT_DEPLOYMENT:-}" != "YES" ]]; then
      echo "Set CONFIRM_MAINNET_NTT_DEPLOYMENT=YES to deploy NTT contracts to mainnet." >&2
      exit 2
    fi
    ;;
  *) usage; echo "Unsupported network: $network" >&2; exit 2 ;;
esac

for token in "$hub_token" "$spoke_token"; do
  if [[ ! "$token" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "Invalid EVM token address: $token" >&2
    exit 2
  fi
done

if [[ -z "${ETH_PRIVATE_KEY:-}" ]]; then
  echo "Set ETH_PRIVATE_KEY in the environment; do not put it in a committed file." >&2
  exit 2
fi
if [[ "${CONFIRM_NTT_DEPLOYMENT:-}" != "YES" ]]; then
  echo "Set CONFIRM_NTT_DEPLOYMENT=YES after reviewing the NTT deployment parameters." >&2
  exit 2
fi
command -v ntt >/dev/null 2>&1 || {
  echo "NTT CLI is required. Run scripts/install-ntt-cli.sh first." >&2
  exit 1
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
if [[ "$network" == "testnet" ]]; then
  deployment="$PACKAGE_DIR/vaults/$target/testnet/deployment.json"
else
  deployment="$PACKAGE_DIR/vaults/$target/mainnet/deployment.json"
fi
if [[ ! -f "$deployment" ]]; then
  echo "Missing $deployment; run pnpm ntt:init first." >&2
  exit 1
fi

echo "Deploying $symbol NTT on $network: $hub_chain locking → $spoke_chain burning"
echo "Hub token: $hub_token"
echo "Spoke peer token: $spoke_token"
echo "Deployment file: $deployment"

ntt add-chain "$hub_chain" --latest --mode locking --token "$hub_token" -p "$deployment"
ntt add-chain "$spoke_chain" --latest --mode burning --token "$spoke_token" -p "$deployment"
ntt status -p "$deployment"

echo "Next: grant the spoke NttManager mint authority on $spoke_token, then run ntt status again."
