# Horizon Wormhole NTT design

Design notes for bridging ERC-4626 vault shares (`avBTCv`, `avMEZOv`) between Mezo and Base with Wormhole [Native Token Transfers (NTT)](https://wormhole.com/docs/products/token-transfers/native-token-transfers/get-started/).

Operational setup, deploy, verify, and Wave 2 addresses: [`../README.md`](../README.md). Vault accounting: [`../../contracts/docs/vault-design.md`](../../contracts/docs/vault-design.md).

---

## Goals

1. Move **vault shares only** — never Id20, gauges, or Mezo Earn positions.
2. Keep Mezo as the **canonical locking hub** so total share supply stays conserved.
3. Mint/burn a **peer ERC-20** on Base / Base Sepolia for Aero and other Base DeFi.
4. Attach NTT as an **external manager** around existing ERC-20/4626 tokens — no vault math changes for bridging.

---

## Topology

Hub-and-spoke (same pattern as Mezo’s Portal MUSD NTT):

| Network | Hub (locking) | Spoke (burning) | Hub token | Spoke token |
|---------|---------------|-----------------|-----------|-------------|
| Testnet | Mezo (`31611`) | Base Sepolia (`84532`) | Mezo `Vault` share | Base `VaultPeer` |
| Mainnet | Mezo (`31612`) | Base (`8453`) | Mezo `Vault` share | Base `VaultPeer` |

```text
Mezo Earn / Id20 / gauges
        │
        ▼
   Horizon Vault (ERC-4626 share)  ──NTT lock──►  Wormhole
        ▲                                           │
        │                                           ▼
   NTT unlock / redeem                     VaultPeer (burn/mint)
                                                    │
                                                    ▼
                                            Aero CL / Base DeFi
```

### Modes

| Side | NTT mode | Token behavior |
|------|----------|----------------|
| Mezo | `locking` | Escrows canonical vault shares in the NTT manager |
| Base / Base Sepolia | `burning` | Mints peer on inbound; burns peer on outbound |

### Wormhole chain ids (testnet configs)

| Chain | Native id | Wormhole chain id (NTT / guardians) |
|-------|-----------|-------------------------------------|
| Mezo | `31611` | `50` |
| Base Sepolia | `84532` | `10004` |

Inbound/outbound rate limits are configured per deployment in `vaults/*/…/deployment.json` (symmetric daily limits applied by the Horizon orchestrator).

---

## Token mapping

| Share | Underlying Id20 (Mezo, stays home) | Hub token | Spoke peer |
|-------|------------------------------------|-----------|------------|
| `avBTCv` | `avBTCm` | Mezo `Vault` | Base `VaultPeer` |
| `avMEZOv` | `avMEZOm` | Mezo `Vault` | Base `VaultPeer` |

`VaultPeer` is deployed by `@aurove/horizon-contracts`. After NTT managers exist, the peer’s minter is set to the spoke `NttManager` and ownership is renounced (irreversible). Until that handoff, the peer deployer remains a temporary owner for setup.

---

## Package responsibilities

| Package | Owns |
|---------|------|
| `@aurove/horizon-contracts` | `Vault`, `VaultFactory`, `VaultPeer`, dead-share seed, `vault-peer:set-minter` |
| `@aurove/horizon-wormhole` | NTT CLI configs (`deployment.json`), deploy/redeploy/verify helpers, status/pull wrappers |
| Horizon root (`../scripts/`) | Cross-chain orchestration: contracts → NTT → peers/limits → minter seal |

Do not change vault share accounting for NTT. Shares remain standard ERC-20/4626; NTT wraps the Mezo token address and the Base peer address.

---

## Transfer precision

Wormhole NTT wire precision is **8 decimals** (`TrimmedAmount`). For 18-decimal vault/peer tokens, amounts with non-zero dust in the low 10 digits revert with `TransferAmountHasDust`. Bridging UIs and scripts should floor amounts to 8-decimal precision before transfer.

---

## Config artifacts

Each vault share has:

```text
vaults/<symbol>/{testnet,mainnet}/deployment.json
```

Produced by `ntt init` and filled by `ntt add-chain` / `ntt push`. Fields include manager, transceiver, token, mode, owner, pauser, and inbound/outbound limits per peer chain.

RPC overrides for the CLI live in `overrides.json` (start from `example-overrides.json`). The Horizon root deploy script writes RPC URLs from `.env` into that overrides file for Mezo and Base.

---

## Security / ops notes

- **Minter seal** is one-shot: wrong manager address permanently bricks mint/burn on that peer.
- **Redeploy** replaces local `deployment.json` and deploys new managers; prior on-chain NTT deployments remain live.
- **Mainnet** requires extra confirmation env vars (`CONFIRM_HORIZON_MAINNET_DEPLOYMENT`, `CONFIRM_MAINNET_NTT_DEPLOYMENT` as documented in the README).
- Automatic relay on testnet may quote `0` delivery fee; manual redeem via Wormholescan VAA remains the fallback.

---

## References

- [Get Started with NTT](https://wormhole.com/docs/products/token-transfers/native-token-transfers/get-started/)
- [Deploy NTT to EVM](https://wormhole.com/docs/products/token-transfers/native-token-transfers/guides/deploy-to-evm/)
- [NTT CLI commands](https://wormhole.com/docs/products/token-transfers/native-token-transfers/reference/cli-commands/)
- Mezo NTT bridge layout: [mezo-org/ntt-bridge](https://github.com/mezo-org/ntt-bridge)
