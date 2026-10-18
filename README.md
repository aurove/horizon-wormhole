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
├── example-overrides.json                         # copy → overrides.json for RPCs
└── package.json                                   # @aurove/horizon-wormhole
```

Each `deployment.json` was created with the official NTT CLI (`ntt init`). Chain entries are empty until `ntt add-chain` runs against deployed vault tokens.

## Prerequisites

1. **NTT CLI** (Bun-based):

   ```bash
   curl -fsSL https://bun.sh/install | bash
   export PATH="$HOME/.bun/bin:$PATH"
   curl -fsSL https://raw.githubusercontent.com/wormhole-foundation/native-token-transfers/main/cli/install.sh | bash
   ntt --version
   ```

2. **Foundry** (already used by `horizon/contracts`).
3. Funded deployer key on Mezo + Base (or Base Sepolia).
4. Vault shares deployed from `horizon/contracts`:

   ```bash
   pnpm --filter @aurove/horizon-contracts exec hardhat deploy --tags VaultFactory,Vaults --network testnet
   ```

5. Peer mintable ERC-20 on the spoke (NTT requires a token on every chain). Use Wormhole’s [example NTT token](https://github.com/wormhole-foundation/example-ntt-token-evm) (`PeerToken`) or an equivalent, then grant the spoke `NttManager` mint rights after `add-chain`.

## Configure vault token addresses

Edit `helpers/vault-tokens.ts` and set `mezoToken.testnet` / `mezoToken.mainnet` to the deployed `Vault` addresses from `horizon/contracts/deployments/{network}/avBTCVault.json` (and `avMEZOVault.json`).

Print ready-to-run CLI commands:

```bash
pnpm exec tsx scripts/print-add-chain-commands.ts
```

## Deploy NTT (after addresses are set)

```bash
export ETH_PRIVATE_KEY=0x...
# optional: cp example-overrides.json overrides.json  # custom RPCs

# Example: avBTCv testnet hub (Mezo locking)
ntt add-chain Mezo --latest --mode locking \
  --token <MEZO_avBTCv_ADDRESS> \
  -p vaults/avBTCv/testnet/deployment.json

# Spoke (Base Sepolia burning) — requires spoke PeerToken address
ntt add-chain BaseSepolia --latest --mode burning \
  --token <BASE_SEPOLIA_PEER_TOKEN> \
  -p vaults/avBTCv/testnet/deployment.json

ntt status -p vaults/avBTCv/testnet/deployment.json
ntt push  -p vaults/avBTCv/testnet/deployment.json   # if local rate-limit / peer edits need applying
```

Repeat for `avMEZOv` and for mainnet (`Mezo` + `Base`).

Package scripts wrap status/pull:

```bash
pnpm ntt:status:avBTCv:testnet
pnpm ntt:pull:avBTCv:testnet
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
