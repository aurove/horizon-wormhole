# Horizon Wormhole NTT

Technical reference for `@aurove/horizon-wormhole`: Wormhole Native Token Transfer (NTT) tooling that bridges ERC-4626 vault shares (`avBTCv`, `avMEZOv`) from [`@aurove/horizon-contracts`](../contracts) between Mezo and Base.

Package root: `horizon/wormhole` inside the [Horizon](https://github.com/aurove/horizon) workspace. License: **MIT**.

Design notes: [`docs/ntt-design.md`](./docs/ntt-design.md). Hackathon address book and demo txs: [`../SUBMISSION.md`](../SUBMISSION.md). Contracts deploy/verify: [`../contracts/README.md`](../contracts/README.md).

---

## Inventory

This package does not own Solidity sources. It configures and operates the official Wormhole NTT stack around Horizon tokens:

| Component | Role |
|-----------|------|
| NTT Manager (locking) | Mezo hub — escrows canonical vault shares |
| NTT Manager (burning) | Base / Base Sepolia spoke — mint/burn `VaultPeer` |
| Wormhole transceiver | Guardian-attested messaging for each manager |
| `deployment.json` | Per-vault, per-network NTT CLI config (addresses, modes, limits) |

| Share | Hub token (Mezo `Vault`) | Spoke token (Base `VaultPeer`) |
|-------|--------------------------|--------------------------------|
| `avBTCv` | Mezo vault share | Base peer ERC-20 |
| `avMEZOv` | Mezo vault share | Base peer ERC-20 |

Underlying Id20 (`avBTCm` / `avMEZOm`), gauges, and Mezo Earn rewards stay on Mezo. Bridging moves vault shares only.

---

## Tooling

| Tool | Notes |
|------|-------|
| Wormhole NTT CLI | Pinned install via `pnpm ntt:install` (upstream `v1.10.0+cli`; `ntt --version` reports `1.7.0`) |
| Bun | `v1.2.23` required by Wormhole’s installer; ensure Bun’s bin dir is on `PATH` |
| Foundry (`forge`, `cast`) | Used by NTT verify / deploy (Cancun hardfork for Mezo bytecode) |
| Node.js + pnpm | Package scripts and Horizon root orchestrator |

```text
wormhole/
├── vaults/
│   ├── avBTCv/{testnet,mainnet}/deployment.json
│   └── avMEZOv/{testnet,mainnet}/deployment.json
├── helpers/vault-tokens.ts          # share ↔ contracts mapping
├── scripts/
│   ├── install-ntt-cli.sh           # pinned NTT CLI install
│   ├── init-configs.sh              # create missing deployment.json files
│   ├── deploy-ntt.sh                # deploy hub + spoke managers
│   ├── redeploy-ntt.mjs             # fresh configs + managers
│   ├── verify-ntt.mjs               # explorer verify proxies + impls
│   └── print-add-chain-commands.ts  # preview ntt add-chain cmds
├── docs/ntt-design.md
├── example-overrides.json           # copy → overrides.json for RPCs
└── package.json                     # @aurove/horizon-wormhole
```

Workspace orchestration lives in `../scripts/deploy-horizon.mjs` and `../scripts/lib/` (contracts deploy, NTT configure, peer limits, minter handoff).

---

## Development setup

Prerequisites:

- Node.js 20+ and [pnpm](https://pnpm.io)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Bun v1.2.23](https://bun.sh) on `PATH`
- Funded deployer on Mezo + Base Sepolia (testnet) when deploying

From the Horizon workspace root (`horizon/`):

```bash
git submodule update --init --recursive
pnpm install
pnpm ntt:install
pnpm ntt:version   # expect package version 1.7.0 from the pinned CLI
```

Vault shares and Base peers must exist before NTT deploy (from `@aurove/horizon-contracts`):

```bash
pnpm --filter @aurove/horizon-contracts hh deploy --tags VaultFactory,Vaults --network testnet
pnpm --filter @aurove/horizon-contracts deploy:peer:testnet
```

### Environment

Copy the workspace env file (root orchestrator and this package both read it):

```bash
# From horizon/
cp .env.example .env
```

| Variable | Required for | Purpose |
|----------|--------------|---------|
| `ETH_PRIVATE_KEY` | Deploy / configure | Shared Mezo + Base + NTT signer |
| `MEZO_TESTNET_RPC_URL` | Deploy / verify / status | Default `https://rpc.test.mezo.org` |
| `BASE_SEPOLIA_RPC_URL` | Deploy / verify / status | Default `https://sepolia.base.org` |
| `HORIZON_AVBTCV_NTT_LIMIT` | Cross-chain deploy | Positive daily limit (18-decimal units) |
| `HORIZON_AVMEZOV_NTT_LIMIT` | Cross-chain deploy | Positive daily limit (18-decimal units) |
| `CONFIRM_HORIZON_DEPLOYMENT` | Cross-chain deploy | Must be `YES` |
| `BASESCAN_API_KEY` | Cross-chain deploy + Base verify | Or `ETHERSCAN_API_KEY`. Required unless `HORIZON_SKIP_NTT_VERIFY=YES` |
| `HORIZON_SKIP_NTT_VERIFY` | Optional | `YES` skips explorer verify during NTT deploy (then no Basescan key needed for deploy) |
| `HORIZON_SKIP_CONTRACT_DEPLOYMENT` | Optional | `YES` resumes NTT-only after contracts exist |
| `MEZO_MAINNET_RPC_URL` | Mainnet | Required for mainnet deploy/verify |
| `CONFIRM_HORIZON_MAINNET_DEPLOYMENT` | Mainnet | Extra mainnet opt-in |

RPC URLs are passed into the NTT CLI through `overrides.json` (seeded from `example-overrides.json`). Shell-exported vars override `.env`. Never commit private keys.

Optional package-local copy: [`./.env.example`](./.env.example) documents `ETH_PRIVATE_KEY` for direct CLI use.

---

## Checks and tests

This package has no Forge unit suite (NTT contracts come from Wormhole). Local checks:

```bash
# From horizon/wormhole/ or via filter
pnpm typecheck

pnpm ntt:status:avBTCv:testnet
pnpm ntt:status:avMEZOv:testnet
# = ntt status -p vaults/<symbol>/testnet/deployment.json
```

Pull on-chain manager state into the local config (when needed):

```bash
pnpm ntt:pull:avBTCv:testnet
pnpm ntt:pull:avMEZOv:testnet
```

End-to-end / bridge smoke from the Horizon root (needs keys + confirmations):

```bash
# From horizon/
pnpm bridge:roundtrip:testnet          # CONFIRM_HORIZON_TESTNET_ROUNDTRIP=YES
pnpm e2e:horizon-aero:testnet          # CONFIRM_HORIZON_E2E=YES (see .env.example)
```

Preview generated `ntt add-chain` commands (after filling Mezo vault addresses in `helpers/vault-tokens.ts` when required by that helper):

```bash
pnpm ntt:commands
```

---

## Deploy to testnet

### Recommended: full cross-chain workflow

From `horizon/`, deploy Mezo vaults, Base peers, NTT managers/transceivers, bilateral peers + limits, and the irreversible spoke minter handoff:

```bash
export ETH_PRIVATE_KEY=0x...
export HORIZON_AVBTCV_NTT_LIMIT=100
export HORIZON_AVMEZOV_NTT_LIMIT=100
export CONFIRM_HORIZON_DEPLOYMENT=YES
export BASESCAN_API_KEY=...   # or ETHERSCAN_API_KEY; required unless HORIZON_SKIP_NTT_VERIFY=YES
pnpm deploy:cross-chain:testnet
```

Limits are applied symmetrically as inbound and outbound on both chains, then `ntt push` and `ntt status` run. Foundry’s runtime hardfork is set to Cancun for Mezo vault bytecode (`FOUNDRY_HARDFORK` override available). The root deploy script errors without a Basescan/Etherscan key when verification is enabled (default).

Resume NTT-only after contracts are already recorded:

```bash
export HORIZON_SKIP_CONTRACT_DEPLOYMENT=YES
pnpm deploy:cross-chain:testnet
```

### Manual NTT-only path

1. Initialize missing configs (does not overwrite existing `deployment.json`):

```bash
pnpm ntt:init
```

2. Deploy managers for one share:

```bash
export ETH_PRIVATE_KEY=0x...
export CONFIRM_NTT_DEPLOYMENT=YES
pnpm ntt:deploy -- avBTCv testnet <MEZO_VAULT_SHARE> <BASE_SEPOLIA_PEER>
pnpm ntt:deploy -- avMEZOv testnet <MEZO_VAULT_SHARE> <BASE_SEPOLIA_PEER>
```

3. Seal each Base peer to its spoke NTT manager (contracts package):

```bash
pnpm --filter @aurove/horizon-contracts hh vault-peer:set-minter \
  --network baseSepolia \
  --peer <PEER_ADDRESS> \
  --manager <NTT_MANAGER_ADDRESS>
```

### Fresh NTT redeployment

Replaces local configs and deploys **new** managers. Prior on-chain NTT deployments remain live.

```bash
CONFIRM_NTT_REDEPLOYMENT=YES pnpm ntt:redeploy:testnet
```

Complete hub+spoke refresh (contracts + NTT + minter seal):

```bash
# From horizon/
CONFIRM_HORIZON_DEPLOYMENT=YES CONFIRM_HORIZON_REDEPLOYMENT=YES \
  pnpm redeploy:cross-chain:testnet
```

The root script sets `CONFIRM_CONTRACTS_REDEPLOYMENT` / `CONFIRM_NTT_REDEPLOYMENT` for the package redeploy steps once those Horizon confirmations are present.

### Mainnet

Requires `MEZO_MAINNET_RPC_URL` and extra confirmations:

```bash
export CONFIRM_HORIZON_DEPLOYMENT=YES
export CONFIRM_HORIZON_MAINNET_DEPLOYMENT=YES
pnpm deploy:cross-chain:mainnet
```

Manual NTT deploy also needs `CONFIRM_MAINNET_NTT_DEPLOYMENT=YES`. Run and inspect testnet first.

---

## Verification

NTT deploy/redeploy verifies sources by default (Mezo Blockscout; Base/Base Sepolia Basescan). Skip with `HORIZON_SKIP_NTT_VERIFY=YES`.

Standalone verify of manager proxies, Wormhole transceiver proxies, and ERC-1967 implementations:

```bash
# From horizon/wormhole/
pnpm run verify:testnet
pnpm run verify:mainnet

# Or from horizon/
pnpm verify:cross-chain:testnet
```

Needs `forge`, `cast`, the pinned NTT CLI checkout under `~/.ntt-cli/.checkout`, RPCs for both chains, and `BASESCAN_API_KEY` for Base.

| Explorer | Networks | Notes |
|----------|----------|-------|
| Mezo Blockscout | testnet `31611`, mainnet `31612` | Public API; no key |
| Basescan | Base Sepolia `84532`, Base `8453` | Requires API key; verify uses Etherscan API V2 (`api.etherscan.io/v2/api?chainid=…`) |

Wave 2 testnet managers, transceivers, and implementations are verified on explorers (see tables below). Re-run `pnpm run verify:testnet` after redeploys.

---

## Testnet deployment addresses

Wave 2 (2026-11-10). Canonical JSON: `vaults/*/testnet/deployment.json`. Owner / pauser: `0x6E1126EA838DA392A55D8DdeD9bADEccA5835114`.

### avBTCv

| Chain | Role | Address | Verification |
|-------|------|---------|--------------|
| Mezo | Token (vault) | [`0x8e95C83A5144dcdD6ce79D7fBd58057b689f086f`](https://explorer.test.mezo.org/address/0x8e95C83A5144dcdD6ce79D7fBd58057b689f086f) | [Sourcify](https://repo.sourcify.dev/31611/0x8e95C83A5144dcdD6ce79D7fBd58057b689f086f) |
| Mezo | NTT manager (locking) | [`0x01B2C64505f367203429753029EA8BEB66987a09`](https://explorer.test.mezo.org/address/0x01B2C64505f367203429753029EA8BEB66987a09#code) | Blockscout verified |
| Mezo | Wormhole transceiver | [`0xA21328Abc178E1b47eC9A14f40e7100372678d10`](https://explorer.test.mezo.org/address/0xA21328Abc178E1b47eC9A14f40e7100372678d10#code) | Blockscout verified |
| Base Sepolia | Token (peer) | [`0x0d36e2B7350950662859A82A91E13Ad7d0E594E0`](https://sepolia.basescan.org/address/0x0d36e2B7350950662859A82A91E13Ad7d0E594E0#code) | Basescan verified |
| Base Sepolia | NTT manager (burning) | [`0x96e12AD5F0402a458823A8E2A6Ea0E986DCD358e`](https://sepolia.basescan.org/address/0x96e12AD5F0402a458823A8E2A6Ea0E986DCD358e#code) | Basescan verified |
| Base Sepolia | Wormhole transceiver | [`0x82C8d99f67eB28b023387236051cB292c9A477AA`](https://sepolia.basescan.org/address/0x82C8d99f67eB28b023387236051cB292c9A477AA#code) | Basescan verified |

Configured limits (from `deployment.json`): outbound / inbound `1` (1e18 atomic units displayed as `1.000000000000000000`).

### avMEZOv

| Chain | Role | Address | Verification |
|-------|------|---------|--------------|
| Mezo | Token (vault) | [`0x2C45a18a23d5bfFf3Fc0c4Bff6376dA1d943373c`](https://explorer.test.mezo.org/address/0x2C45a18a23d5bfFf3Fc0c4Bff6376dA1d943373c) | [Sourcify](https://repo.sourcify.dev/31611/0x2C45a18a23d5bfFf3Fc0c4Bff6376dA1d943373c) |
| Mezo | NTT manager (locking) | [`0x2a0B2726f7822cEBdE9D665D049a42f13Fa6A517`](https://explorer.test.mezo.org/address/0x2a0B2726f7822cEBdE9D665D049a42f13Fa6A517#code) | Blockscout verified |
| Mezo | Wormhole transceiver | [`0x6201F4c88aAfDd627108467dafA81464E3eb885a`](https://explorer.test.mezo.org/address/0x6201F4c88aAfDd627108467dafA81464E3eb885a#code) | Blockscout verified |
| Base Sepolia | Token (peer) | [`0x172096f3F0F98B9dc1302695A48044D6A3D799C9`](https://sepolia.basescan.org/address/0x172096f3F0F98B9dc1302695A48044D6A3D799C9#code) | Basescan verified |
| Base Sepolia | NTT manager (burning) | [`0x79D11c9d7F5d5ef676c4c87Cf9deEC5D972bd8A1`](https://sepolia.basescan.org/address/0x79D11c9d7F5d5ef676c4c87Cf9deEC5D972bd8A1#code) | Basescan verified |
| Base Sepolia | Wormhole transceiver | [`0x9383b1ACAf2bD2B0F6b205Be9fFbCcBfC78A8300`](https://sepolia.basescan.org/address/0x9383b1ACAf2bD2B0F6b205Be9fFbCcBfC78A8300#code) | Basescan verified |

Configured limits: outbound / inbound `20000000` (20M).

VaultPeer minters are sealed to the spoke NTT managers; peer ownership is renounced after handoff.

---

## Networks

| Network | Native chain id | Hardhat / contracts name | NTT CLI chain name | Default RPC |
|---------|-----------------|--------------------------|--------------------|-------------|
| Mezo testnet | `31611` | `testnet` | `Mezo` | `https://rpc.test.mezo.org` |
| Mezo mainnet | `31612` | `mainnet` | `Mezo` | set `MEZO_MAINNET_RPC_URL` |
| Base Sepolia | `84532` | `baseSepolia` | `BaseSepolia` | `https://sepolia.base.org` |
| Base | `8453` | `base` | `Base` | `https://mainnet.base.org` |

---

## Related packages

| Package | Path | Role |
|---------|------|------|
| `@aurove/horizon-contracts` | [`../contracts`](../contracts) | Vaults, peers, minter handoff |
| `@aurove/horizon-aero` | [`../aero`](../aero) | Base Sepolia Slipstream / CL200 pools vs MUSD |
| dApp | [`aurove/dapp` (`testnet`)](https://github.com/aurove/dapp/tree/testnet) | Bridge + Base swap UI against these NTT deployments |

---

## References

- [Get Started with NTT](https://wormhole.com/docs/products/token-transfers/native-token-transfers/get-started/)
- [Deploy NTT to EVM](https://wormhole.com/docs/products/token-transfers/native-token-transfers/guides/deploy-to-evm/)
- [NTT CLI commands](https://wormhole.com/docs/products/token-transfers/native-token-transfers/reference/cli-commands/)
- Mezo NTT bridge layout: [mezo-org/ntt-bridge](https://github.com/mezo-org/ntt-bridge)
