# Wormhole NTT — Vault Shares

Wormhole [Native Token Transfers (NTT)](https://wormhole.com/docs/products/token-transfers/native-token-transfers/get-started/) tooling for bridging ERC-4626 vault shares from [`@aurove/horizon-contracts`](../contracts).

Horizon is only the project codename. Tokens here are the vault share ERC-20s (`avBTCv`, `avMEZOv`) produced by `Vault` / `VaultFactory` on Mezo.

## Topology

Hub-and-spoke (same pattern as Mezo’s MUSD NTT bridge):

| Network | Hub (locking) | Spoke (burning) | Hub token |
|---------|---------------|-----------------|-----------|
| Testnet | `Mezo` | `BaseSepolia` | Mezo `Vault` share |
| Mainnet | `Mezo` | `Base` | Mezo `Vault` share |

- **Mezo (locking):** escrow canonical vault shares; supply stays conserved.
- **Base / Base Sepolia (burning):** mint/burn a peer ERC-20 representation for Aerodrome and other Base DeFi.

Underlying Id20 (`avBTCm` / `avMEZOm`), gauges, and Mezo Earn rewards stay on Mezo. Bridging moves vault shares only.

## Layout

```text
wormhole/
├── vaults/
│   ├── avBTCv/{testnet,mainnet}/deployment.json   # ntt init output
│   └── avMEZOv/{testnet,mainnet}/deployment.json
├── helpers/vault-tokens.ts                        # share ↔ contracts mapping
├── scripts/print-add-chain-commands.ts            # prints ntt add-chain cmds
├── scripts/install-ntt-cli.sh                     # installs pinned NTT CLI
├── scripts/init-configs.sh                        # creates missing NTT config files
├── scripts/deploy-ntt.sh                          # deploys hub and spoke managers
├── example-overrides.json                         # copy → overrides.json for RPCs
└── package.json                                   # @aurove/horizon-wormhole
```

The workspace-level orchestration is in `../scripts/deploy-horizon.mjs`; its helpers in `../scripts/lib/` separate contract deployment, NTT configuration, and shared validation/command handling.

Each `deployment.json` is the output of the official NTT CLI (`ntt init`). Chain entries remain empty until deployment. The initializer only creates missing files, so it will not overwrite an existing deployment.

## Prerequisites

1. **Node.js, npm, and Bun v1.2.23**. Wormhole's installer uses Bun; make sure its binary directory is on `PATH`:

   ```bash
   # Install Bun v1.2.23 using Bun's official installation instructions.
   pnpm ntt:install
   ```

2. **Foundry** (already used by `horizon/contracts`).
3. Funded deployer key on Mezo + Base (or Base Sepolia).
4. Vault shares deployed from `horizon/contracts`:

   ```bash
   pnpm --filter @aurove/horizon-contracts exec hardhat deploy --tags VaultFactory,Vaults --network testnet
   ```

5. Use the root deployment workflow below to deploy the Mezo vaults, Base peer tokens, and NTT managers with a shared setup signer. For a manual flow, deploy the peers with `pnpm --filter @aurove/horizon-contracts deploy:peer:testnet` (or `deploy:peer:mainnet`) and configure the NTT managers separately.

## End-to-end deployment

From `horizon/`, the root script coordinates both contracts deployments, the NTT managers, bilateral peer and limit configuration, and the one-time spoke minter handoff. The script is split between `scripts/deploy-horizon.mjs` (workflow) and `scripts/lib/` (command execution, deployment, and NTT/config helpers). It uses `ETH_PRIVATE_KEY` for deployments and NTT configuration so the same account owns the peer tokens during setup and signs NTT configuration transactions.

The root script automatically reads `horizon/.env` if it exists. Copy [`.env.example`](../.env.example) to `.env` and fill in the required values; variables already exported in the shell take precedence. Keep the real `.env` file private.

The root script passes `MEZO_TESTNET_RPC_URL` / `MEZO_MAINNET_RPC_URL` and `BASE_SEPOLIA_RPC_URL` / `BASE_RPC_URL` to the NTT CLI through its `overrides.json` configuration. This lets the same `.env` RPC settings control NTT reads and writes as well as contract deployment.

Set an explicit positive daily NTT limit for each 18-decimal vault share. The script applies each value symmetrically as the inbound and outbound limit on both chains, then runs `ntt push` and `ntt status`.

Testnet (Mezo + Base Sepolia):

```bash
export ETH_PRIVATE_KEY=0x...
export HORIZON_AVBTCV_NTT_LIMIT=100
export HORIZON_AVMEZOV_NTT_LIMIT=100
export CONFIRM_HORIZON_DEPLOYMENT=YES
pnpm deploy:cross-chain:testnet
```

Mainnet (Mezo + Base) requires `MEZO_MAINNET_RPC_URL` and an additional confirmation:

```bash
export ETH_PRIVATE_KEY=0x...
export MEZO_MAINNET_RPC_URL=https://...
export HORIZON_AVBTCV_NTT_LIMIT=10
export HORIZON_AVMEZOV_NTT_LIMIT=10
export CONFIRM_HORIZON_DEPLOYMENT=YES
export CONFIRM_HORIZON_MAINNET_DEPLOYMENT=YES
pnpm deploy:cross-chain:mainnet
```

The installer uses Wormhole's documented process and verifies the upstream `v1.10.0+cli` source tag. That release reports package version `1.7.0` through `ntt --version`; the deployment script checks that CLI version before it proceeds. For NTT simulations, the root workflow sets Foundry's runtime hardfork to Cancun to match Mezo vault bytecode; override it with `FOUNDRY_HARDFORK` if needed. NTT deploy and configuration updates verify sources by default: Mezo uses Blockscout and Base/Base Sepolia uses Basescan. Set `BASESCAN_API_KEY` (or `ETHERSCAN_API_KEY`) for the BaseScan verifier. `HORIZON_SKIP_NTT_VERIFY=YES` explicitly skips verification during deployment. To resume NTT setup after the contracts are already deployed, set `HORIZON_SKIP_CONTRACT_DEPLOYMENT=YES`; the script checks that deployment records exist before it skips the Hardhat deploy tasks. The workflow adds only NTT chains missing from each config. It stops if an existing NTT chain has a different token, mode, or owner than expected. Before the irreversible peer minter handoff, it verifies the peer deployer's address against the NTT configuration and the Hardhat task checks the manager and peer state. If a run stops partway through, fix the reported cause and rerun; completed contract/NTT deployments are reused where safe.

The mainnet path broadcasts contracts and configuration transactions. Run the testnet path and inspect the resulting configurations before opting into mainnet.

### Fresh NTT redeployment

The NTT package can replace its local configs and deploy fresh managers after the corresponding fresh vault and peer addresses have been recorded by the contracts package:

```bash
CONFIRM_NTT_REDEPLOYMENT=YES pnpm ntt:redeploy:testnet
```

For mainnet, also set `CONFIRM_HORIZON_MAINNET_DEPLOYMENT=YES`:

```bash
CONFIRM_NTT_REDEPLOYMENT=YES CONFIRM_HORIZON_MAINNET_DEPLOYMENT=YES pnpm ntt:redeploy:mainnet
```

This replaces the selected `deployment.json` files with fresh `ntt init` configs, then deploys new Mezo and Base/Base Sepolia managers for both vault shares. It leaves prior on-chain contracts and Foundry broadcast history intact. The root `pnpm redeploy:cross-chain:<network>` workflow runs the contracts and NTT reset steps in order, then configures bilateral peers and limits and seals the new spoke minters. Use the root workflow for a complete redeployment.

### Verify existing NTT contracts

The standalone verifier submits each configured NTT manager proxy, Wormhole transceiver proxy, and their ERC-1967 implementations to the relevant explorer. It reads addresses from the selected deployment configs and retrieves implementation addresses from proxy storage:

```bash
pnpm run verify:testnet
pnpm run verify:mainnet
```

It needs `forge`, `cast`, the pinned NTT CLI checkout, RPC access for both chains, and a `BASESCAN_API_KEY` (or `ETHERSCAN_API_KEY`) for BaseScan. Deployment and redeployment use the NTT CLI's built-in Foundry verification by default; the standalone command is for already deployed contracts.

## Initialize NTT configuration

From `horizon/`, initialize any missing deployment configs with the official CLI:

```bash
pnpm ntt:init
```

This runs `ntt init Testnet` and `ntt init Mainnet` in temporary directories, then copies each generated config only if the destination file does not already exist.

## Deploy NTT

Deploy the vault shares first and deploy a mintable peer ERC-20 on Base / Base Sepolia. The hub token is the Mezo `Vault` share address; the spoke token is the peer token address. The deployment script uses locking mode on Mezo and burning mode on Base, then checks the resulting deployment status.

```bash
export ETH_PRIVATE_KEY=0x...
export CONFIRM_NTT_DEPLOYMENT=YES
pnpm ntt:deploy -- avBTCv testnet <MEZO_VAULT_SHARE> <BASE_SEPOLIA_PEER_TOKEN>
```

For mainnet, explicitly opt in as well:

```bash
export CONFIRM_MAINNET_NTT_DEPLOYMENT=YES
pnpm ntt:deploy -- avBTCv mainnet <MEZO_VAULT_SHARE> <BASE_PEER_TOKEN>
```

Use `avMEZOv` to deploy the second vault share pair. The NTT deployment script does not grant token mint authority. After deploying and pushing NTT configuration, verify the spoke `NttManager` address in `deployment.json`, then run the `vault-peer:set-minter` Hardhat task documented in [`contracts/README.md`](../contracts/README.md). This one-time operation permanently seals the minter and renounces token ownership. Mainnet deployment requires an extra confirmation variable to reduce accidental production deployments.

For a command preview, set the deployed Mezo vault addresses in `helpers/vault-tokens.ts`, then run:

```bash
pnpm ntt:commands
```

Package scripts wrap status/pull:

```bash
pnpm --filter @aurove/horizon-wormhole ntt:status:avBTCv:testnet
pnpm --filter @aurove/horizon-wormhole ntt:pull:avBTCv:testnet
```

## Relationship to contracts

| Package | Role |
|---------|------|
| `@aurove/horizon-contracts` | Deploy immutable `Vault` / `VaultFactory`; seed dead shares; Mezo-only compounding |
| `@aurove/horizon-wormhole` | NTT managers/transceivers so those vault shares can move Mezo ↔ Base |

Do not change vault share accounting for NTT. Shares remain standard ERC-20/4626; NTT attaches as an external manager around the Mezo token address.

## References

- [Get Started with NTT](https://wormhole.com/docs/products/token-transfers/native-token-transfers/get-started/)
- [Deploy NTT to EVM](https://wormhole.com/docs/products/token-transfers/native-token-transfers/guides/deploy-to-evm/)
- [NTT CLI commands](https://wormhole.com/docs/products/token-transfers/native-token-transfers/reference/cli-commands/)
- Mezo NTT bridge layout (inspiration): [mezo-org/ntt-bridge](https://github.com/mezo-org/ntt-bridge)
- Vault design: [`../contracts/docs/vault-design.md`](../contracts/docs/vault-design.md)
