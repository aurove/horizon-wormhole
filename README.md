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

Each `deployment.json` is the output of the official NTT CLI (`ntt init`). Chain entries remain empty until deployment. The initializer only creates missing files, so it will not overwrite an existing deployment.

## Prerequisites

1. **Bun v1.2.23** and the pinned NTT CLI release:

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

5. Deploy the Horizon spoke peer token on Base Sepolia or Base. From `horizon/`, run `pnpm --filter @aurove/horizon-contracts deploy:peer:testnet` (or `deploy:peer:mainnet`) with the matching Base network key and RPC set. The deployer owns the peers and will set each peer's NTT Manager as minter after `add-chain`.

## End-to-end deployment

From `horizon/`, the root script coordinates both contracts deployments, the NTT managers, bilateral peer and limit configuration, and the one-time spoke minter handoff. It uses `ETH_PRIVATE_KEY` for all three deployments so the same account owns the peer tokens during setup and signs NTT configuration transactions.

Set an explicit positive daily NTT limit for each 18-decimal vault share. The script applies each value symmetrically as the inbound and outbound limit on both chains, then runs `ntt push` and `ntt status`.

Testnet (Mezo + Base Sepolia):

```bash
export ETH_PRIVATE_KEY=0x...
export HORIZON_AVBTCV_NTT_LIMIT=100
export HORIZON_AVMEZOV_NTT_LIMIT=100
export CONFIRM_HORIZON_DEPLOYMENT=YES
pnpm deploy:cross-chain:testnet
```

Mainnet (Mezo + Base) requires `MAINNET_RPC_URL` and an additional confirmation:

```bash
export ETH_PRIVATE_KEY=0x...
export MAINNET_RPC_URL=https://...
export HORIZON_AVBTCV_NTT_LIMIT=10
export HORIZON_AVMEZOV_NTT_LIMIT=10
export CONFIRM_HORIZON_DEPLOYMENT=YES
export CONFIRM_HORIZON_MAINNET_DEPLOYMENT=YES
pnpm deploy:cross-chain:mainnet
```

The script verifies the pinned NTT CLI version, deploys or reuses the contract deployments, and adds only NTT chains missing from each config. It stops if an existing NTT chain has a different token or mode. The peer minter handoff is irreversible: verify the manager address printed in `deployment.json` before the script reaches that step. If a run stops partway through, fix the reported cause and rerun; completed contract/NTT deployments are reused where safe.

The mainnet path broadcasts contracts and configuration transactions. Run the testnet path and inspect the resulting configurations before opting into mainnet.

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

Use `avMEZOv` to deploy the second vault share pair. The deploy script does not grant token mint authority. After deployment, verify the spoke `NttManager` address in `deployment.json`, then call `setMinter(nttManager)` on the peer token. This is a one-time operation that permanently seals its minter and renounces token ownership. Mainnet deployment requires an extra confirmation variable to reduce accidental production deployments.

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
