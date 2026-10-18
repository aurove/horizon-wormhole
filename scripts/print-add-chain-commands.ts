/**
 * Prints the `ntt add-chain` commands for vault shares once Mezo vault token
 * addresses are filled in helpers/vault-tokens.ts.
 *
 * Does not broadcast transactions — copy/paste after exporting ETH_PRIVATE_KEY.
 * Spoke chains still need a peer mintable ERC-20 (`--token`); deploy PeerToken
 * (or equivalent) on Base / BaseSepolia before running the spoke command.
 */
import {
  NTT_TOPOLOGY,
  VAULT_NTT_TARGETS,
  requireMezoVaultToken,
  type VaultShareSymbol,
} from "../helpers/vault-tokens";

function printForNetwork(network: "testnet" | "mainnet"): void {
  const topo = NTT_TOPOLOGY[network];
  console.log(`\n# --- ${network} (${topo.hub.chain} → ${topo.spoke.chain}) ---`);

  for (const target of VAULT_NTT_TARGETS) {
    let mezoToken: string;
    try {
      mezoToken = requireMezoVaultToken(target.symbol as VaultShareSymbol, network);
    } catch (err) {
      console.log(`\n# ${target.symbol}: ${(err as Error).message}`);
      continue;
    }

    const path = target.nttPaths[network];
    console.log(`\n# ${target.symbol} (${target.name})`);
    console.log(
      `ntt add-chain ${topo.hub.chain} --latest --mode ${topo.hub.mode} --token ${mezoToken} -p ${path}`,
    );
    console.log(
      `# Spoke: deploy a mintable PeerToken on ${topo.spoke.chain}, then:`,
    );
    console.log(
      `ntt add-chain ${topo.spoke.chain} --latest --mode ${topo.spoke.mode} --token <${topo.spoke.chain}_PEER_TOKEN> -p ${path}`,
    );
    console.log(`# Grant spoke NttManager mint rights on the PeerToken, then:`);
    console.log(`ntt status -p ${path}`);
  }
}

printForNetwork("testnet");
printForNetwork("mainnet");
