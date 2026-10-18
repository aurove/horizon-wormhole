/**
 * Vault share tokens bridged via Wormhole NTT.
 *
 * Canonical shares are the ERC-4626 `Vault` ERC-20s deployed by `@aurove/horizon-contracts`
 * (`VaultFactory` → avBTCv / avMEZOv). Mezo is the locking hub; Base (or Base Sepolia) is the
 * burning spoke where NTT deploys a peer mintable representation.
 *
 * Fill addresses after `hardhat deploy --tags Vaults` in horizon/contracts. Leave null until then.
 */

export type VaultShareSymbol = "avBTCv" | "avMEZOv";

export interface VaultNttTarget {
  /** Share symbol from the contracts package. */
  symbol: VaultShareSymbol;
  /** Human-readable vault name. */
  name: string;
  /** Underlying Id20 on Mezo (not the NTT token). */
  underlyingId20Symbol: "avBTCm" | "avMEZOm";
  /** hardhat-deploy name under horizon/contracts/deployments. */
  contractsDeploymentName: "avBTCVault" | "avMEZOVault";
  /** Path to NTT deployment.json relative to this package root. */
  nttPaths: {
    testnet: string;
    mainnet: string;
  };
  /**
   * Mezo vault share token address (locking mode `--token`).
   * Null until the vault is deployed on that network.
   */
  mezoToken: {
    testnet: string | null;
    mainnet: string | null;
  };
}

/** Planned hub-and-spoke topology for every vault share. */
export const NTT_TOPOLOGY = {
  testnet: {
    hub: { chain: "Mezo", mode: "locking" as const },
    spoke: { chain: "BaseSepolia", mode: "burning" as const },
  },
  mainnet: {
    hub: { chain: "Mezo", mode: "locking" as const },
    spoke: { chain: "Base", mode: "burning" as const },
  },
} as const;

export const VAULT_NTT_TARGETS: readonly VaultNttTarget[] = [
  {
    symbol: "avBTCv",
    name: "avBTC Vault",
    underlyingId20Symbol: "avBTCm",
    contractsDeploymentName: "avBTCVault",
    nttPaths: {
      testnet: "vaults/avBTCv/testnet/deployment.json",
      mainnet: "vaults/avBTCv/mainnet/deployment.json",
    },
    mezoToken: {
      testnet: null,
      mainnet: null,
    },
  },
  {
    symbol: "avMEZOv",
    name: "avMEZO Vault",
    underlyingId20Symbol: "avMEZOm",
    contractsDeploymentName: "avMEZOVault",
    nttPaths: {
      testnet: "vaults/avMEZOv/testnet/deployment.json",
      mainnet: "vaults/avMEZOv/mainnet/deployment.json",
    },
    mezoToken: {
      testnet: null,
      mainnet: null,
    },
  },
] as const;

export function requireMezoVaultToken(
  symbol: VaultShareSymbol,
  network: "testnet" | "mainnet",
): string {
  const target = VAULT_NTT_TARGETS.find((t) => t.symbol === symbol);
  if (!target) throw new Error(`Unknown vault share symbol: ${symbol}`);
  const address = target.mezoToken[network];
  if (!address) {
    throw new Error(
      `Missing Mezo token for ${symbol} on ${network}. Deploy the vault via ` +
        `@aurove/horizon-contracts (hardhat deploy --tags Vaults), then set ` +
        `helpers/vault-tokens.ts mezoToken.${network}.`,
    );
  }
  return address;
}
