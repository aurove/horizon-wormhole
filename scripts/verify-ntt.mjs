#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const horizonRoot = resolve(packageRoot, "..");
const nttRoot = resolve(homedir(), ".ntt-cli/.checkout");
const foundryRoot = resolve(nttRoot, "evm");
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: foundryRoot, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
}

function capture(command, args, env) {
  const result = spawnSync(command, args, { cwd: foundryRoot, env, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}: ${result.stderr}`);
  return result.stdout.trim();
}

function loadEnv() {
  const envPath = resolve(horizonRoot, ".env");
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function verify(address, contract, chainId, rpcUrl, explorer, env) {
  const common = ["verify-contract", address, contract, "--chain", String(chainId), "--rpc-url", rpcUrl, "--via-ir", "--guess-constructor-args", "--watch"];
  if (explorer.kind === "blockscout") {
    common.push("--verifier", "blockscout", "--verifier-url", explorer.url);
  } else {
    common.push("--verifier", "etherscan", "--etherscan-api-key", explorer.apiKey);
  }
  run("forge", common, env);
}

function main() {
  loadEnv();
  const network = process.argv[2];
  if (network !== "testnet" && network !== "mainnet") {
    throw new Error("Usage: node scripts/verify-ntt.mjs <testnet|mainnet>");
  }
  readFileSync(resolve(nttRoot, "evm/foundry.toml"), "utf8");

  const chains = network === "testnet"
    ? [
        { name: "Mezo", id: 31611, rpc: process.env.MEZO_TESTNET_RPC_URL || "https://rpc.test.mezo.org", explorer: { kind: "blockscout", url: "https://api.explorer.test.mezo.org/api" } },
        { name: "BaseSepolia", id: 84532, rpc: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", explorer: { kind: "etherscan", apiKey: process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY } },
      ]
    : [
        { name: "Mezo", id: 31612, rpc: process.env.MEZO_MAINNET_RPC_URL, explorer: { kind: "blockscout", url: "https://api.explorer.mezo.org/api" } },
        { name: "Base", id: 8453, rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org", explorer: { kind: "etherscan", apiKey: process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY } },
      ];
  const suffix = network;
  const vaults = ["avBTCv", "avMEZOv"];
  const env = { ...process.env };

  for (const chain of chains) {
    if (!chain.rpc) throw new Error(`Missing RPC URL for ${chain.name}`);
    if (chain.explorer.kind === "etherscan" && !chain.explorer.apiKey) {
      throw new Error(`Set BASESCAN_API_KEY or ETHERSCAN_API_KEY to verify ${chain.name} contracts`);
    }
    for (const vault of vaults) {
      const path = resolve(packageRoot, "vaults", vault, suffix, "deployment.json");
      const deployment = JSON.parse(readFileSync(path, "utf8"));
      const chainConfig = deployment.chains?.[chain.name];
      if (!chainConfig?.manager || !chainConfig.transceivers?.wormhole?.address) {
        throw new Error(`Missing ${chain.name} NTT manager/transceiver in ${path}`);
      }
      const rpcEnv = { ...env, ETH_RPC_URL: chain.rpc };
      for (const [label, address, contract] of [
        ["manager proxy", chainConfig.manager, "lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy"],
        ["Wormhole transceiver proxy", chainConfig.transceivers.wormhole.address, "lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy"],
      ]) {
        console.log(`Verifying ${vault} ${chain.name} ${label} at ${address}`);
        verify(address, contract, chain.id, chain.rpc, chain.explorer, rpcEnv);
        const implementationWord = capture("cast", ["storage", address, implementationSlot, "--rpc-url", chain.rpc], rpcEnv);
        const implementation = `0x${implementationWord.slice(-40)}`;
        const implementationContract = label === "manager proxy"
          ? `src/NttManager/NttManager${chainConfig.managerVariant === "no-rate-limiting" ? "NoRateLimiting" : ""}.sol:NttManager${chainConfig.managerVariant === "no-rate-limiting" ? "NoRateLimiting" : ""}`
          : "src/Transceiver/WormholeTransceiver/WormholeTransceiver.sol:WormholeTransceiver";
        console.log(`Verifying ${vault} ${chain.name} implementation at ${implementation}`);
        verify(implementation, implementationContract, chain.id, chain.rpc, chain.explorer, rpcEnv);
      }
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
