#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const horizonRoot = resolve(packageRoot, "..");
const contractsRoot = resolve(horizonRoot, "contracts");
const nttRoot = resolve(homedir(), ".ntt-cli/.checkout");
const symbols = ["avBTCv", "avMEZOv"];
const scriptPath = fileURLToPath(import.meta.url);

function run(command, args, env = process.env, cwd = nttRoot) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requiredAddress(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Missing or invalid ${label}: ${value}`);
  }
  return value;
}

function configureRpcOverrides(env, mainnet) {
  const hubUrl = env[mainnet ? "MEZO_MAINNET_RPC_URL" : "MEZO_TESTNET_RPC_URL"];
  const spokeUrl = env[mainnet ? "BASE_RPC_URL" : "BASE_SEPOLIA_RPC_URL"];
  const chains = {
    ...(hubUrl ? { Mezo: { rpc: hubUrl } } : {}),
    ...(spokeUrl ? { [mainnet ? "Base" : "BaseSepolia"]: { rpc: spokeUrl } } : {}),
  };
  if (Object.keys(chains).length === 0) return;
  const path = resolve(nttRoot, "overrides.json");
  const existing = existsSync(path) ? readJson(path) : {};
  writeFileSync(path, JSON.stringify({ ...existing, chains: { ...existing.chains, ...chains } }, null, 2));
}

function resetConfig(network, symbol, suffix) {
  const tempRoot = mkdtempSync(join(tmpdir(), `horizon-ntt-${symbol}-`));
  const freshPath = join(tempRoot, "deployment.json");
  const destination = resolve(packageRoot, "vaults", symbol, suffix, "deployment.json");
  try {
    run("ntt", ["init", network, "-p", freshPath]);
    copyFileSync(freshPath, destination);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
  return destination;
}

function tokenAddresses(symbol, contractNetwork, spokeNetwork) {
  const hubName = symbol === "avBTCv" ? "avBTCVault" : "avMEZOVault";
  const hub = readJson(resolve(contractsRoot, "deployments", contractNetwork, `${hubName}.json`));
  const peer = readJson(resolve(contractsRoot, "deployments", spokeNetwork, `${symbol}Peer.json`));
  return {
    hub: requiredAddress(hub.address, `${symbol} Mezo vault`),
    spoke: requiredAddress(peer.address, `${symbol} spoke peer`),
  };
}

function deployChain(configPath, chain, mode, token, env) {
  const args = ["add-chain", chain, "--latest", "--mode", mode, "--token", token, "--yes", "-p", configPath];
  if (env.HORIZON_SKIP_NTT_VERIFY === "YES") args.push("--skip-verify");
  run("ntt", args, env);
}

function main(network) {
  const rootEnvPath = resolve(horizonRoot, ".env");
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
  if (network !== "testnet" && network !== "mainnet") {
    throw new Error(`Usage: node ${scriptPath} <testnet|mainnet>`);
  }
  if (process.env.CONFIRM_NTT_REDEPLOYMENT !== "YES") {
    throw new Error("Set CONFIRM_NTT_REDEPLOYMENT=YES to replace the NTT deployment configs and deploy fresh managers");
  }
  const mainnet = network === "mainnet";
  if (mainnet && process.env.CONFIRM_HORIZON_MAINNET_DEPLOYMENT !== "YES") {
    throw new Error("Mainnet also requires CONFIRM_HORIZON_MAINNET_DEPLOYMENT=YES");
  }
  const env = {
    ...process.env,
    HORIZON_NTT_NETWORK: mainnet ? "Mainnet" : "Testnet",
    FOUNDRY_HARDFORK: process.env.FOUNDRY_HARDFORK || "cancun",
    MEZO_VERIFIER: "blockscout",
    MEZO_VERIFIER_URL: mainnet ? "https://api.explorer.mezo.org/api" : "https://api.explorer.test.mezo.org/api",
    [mainnet ? "BASE_VERIFIER" : "BASESEPOLIA_VERIFIER"]: "etherscan",
    [mainnet ? "BASE_SCAN_API_KEY" : "BASESEPOLIA_SCAN_API_KEY"]:
      process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY || "",
  };
  if (!env.ETH_PRIVATE_KEY) throw new Error("Set ETH_PRIVATE_KEY in the Horizon root .env or shell environment");
  if (env.HORIZON_SKIP_NTT_VERIFY !== "YES" && !env[mainnet ? "BASE_SCAN_API_KEY" : "BASESEPOLIA_SCAN_API_KEY"]) {
    throw new Error("Set BASESCAN_API_KEY or ETHERSCAN_API_KEY to verify NTT contracts on BaseScan");
  }

  const networkName = mainnet ? "Mainnet" : "Testnet";
  const contractNetwork = network;
  const spokeChain = mainnet ? "Base" : "BaseSepolia";
  const spokeNetwork = mainnet ? "base" : "baseSepolia";
  const suffix = network;
  configureRpcOverrides(env, mainnet);

  for (const symbol of symbols) {
    const configPath = resetConfig(networkName, symbol, suffix);
    const tokens = tokenAddresses(symbol, contractNetwork, spokeNetwork);
    console.log(`\nFresh ${symbol} NTT deployment: ${networkName} Mezo ↔ ${spokeChain}`);
    deployChain(configPath, "Mezo", "locking", tokens.hub, env);
    deployChain(configPath, spokeChain, "burning", tokens.spoke, env);
  }
  console.log("Fresh NTT managers deployed. Run the Horizon root redeploy workflow to link peers, apply limits, and seal VaultPeer minters.");
}

try {
  main(process.argv[2]);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
