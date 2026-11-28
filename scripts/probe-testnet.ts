import { pathToFileURL } from "node:url";
import { rpc } from "@stellar/stellar-sdk";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_TOKEN_MESSENGER,
  BASE_SEPOLIA_USDC,
  baseEvmConfigFromEnvironment,
  createBaseRpc,
} from "../src/base/evm.ts";

const STELLAR_CONTRACTS = Object.freeze([
  ["WebAuthn verifier", "STELLAR_WEBAUTHN_VERIFIER"],
  ["Ed25519 verifier", "STELLAR_ED25519_VERIFIER"],
  ["spending-limit policy", "STELLAR_SPENDING_LIMIT_POLICY"],
  ["USDC", "STELLAR_USDC_SAC"],
  ["CCTP TokenMessenger", "CCTP_STELLAR_TOKEN_MESSENGER"],
  ["CCTP MessageTransmitter", "CCTP_STELLAR_MESSAGE_TRANSMITTER"],
  ["CCTP forwarder", "CCTP_STELLAR_FORWARDER"],
] as const);

const BASE_CONTRACTS = Object.freeze([
  ["USDC", BASE_SEPOLIA_USDC],
  ["TokenMessenger", BASE_SEPOLIA_TOKEN_MESSENGER],
  ["MessageTransmitter", BASE_SEPOLIA_MESSAGE_TRANSMITTER],
] as const);

interface StellarProbeRpc {
  getLatestLedger(): Promise<{ readonly sequence: number }>;
  getContractMethods(contractId: string): Promise<readonly unknown[]>;
}

interface BaseProbeRpc {
  request(method: string, params: readonly unknown[]): Promise<unknown>;
}

export interface TestnetProbeResult {
  readonly base: {
    readonly chainId: number;
    readonly contracts: readonly { readonly name: string; readonly byteLength: number }[];
  };
  readonly stellar: {
    readonly latestLedger: number;
    readonly contracts: readonly { readonly name: string; readonly methodCount: number }[];
  };
}

export class TestnetProbeError extends Error {
  constructor(readonly stage: string) {
    super(`Testnet readiness probe failed at ${stage}; no transaction was submitted.`);
    this.name = "TestnetProbeError";
  }
}

function required(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) throw new TestnetProbeError(`configuration:${key}`);
  return value;
}

function contractByteLength(code: unknown, name: string): number {
  if (typeof code !== "string" || !/^0x[0-9a-f]+$/i.test(code) || code === "0x" || code.length % 2 !== 0) {
    throw new TestnetProbeError(`base:${name}`);
  }
  return (code.length - 2) / 2;
}

export async function probeTestnet(input: {
  readonly environment?: NodeJS.ProcessEnv;
  readonly baseRpc?: BaseProbeRpc;
  readonly stellarRpc?: StellarProbeRpc;
} = {}): Promise<TestnetProbeResult> {
  const environment = input.environment ?? process.env;
  const baseRpc = input.baseRpc ?? createBaseRpc(baseEvmConfigFromEnvironment(environment));
  const stellarRpc = input.stellarRpc ?? new rpc.Server(required(environment, "STELLAR_RPC_URL"));

  let chainId: unknown;
  try {
    chainId = await baseRpc.request("eth_chainId", []);
  } catch {
    throw new TestnetProbeError("base:chain");
  }
  if (typeof chainId !== "string" || !/^0x[0-9a-f]+$/i.test(chainId) ||
      BigInt(chainId) !== BigInt(BASE_SEPOLIA_CHAIN_ID)) {
    throw new TestnetProbeError("base:chain");
  }

  const baseContracts = [];
  for (const [name, address] of BASE_CONTRACTS) {
    let code: unknown;
    try {
      code = await baseRpc.request("eth_getCode", [address, "latest"]);
    } catch {
      throw new TestnetProbeError(`base:${name}`);
    }
    baseContracts.push({ name, byteLength: contractByteLength(code, name) });
  }

  let latestLedger: { readonly sequence: number };
  try {
    latestLedger = await stellarRpc.getLatestLedger();
  } catch {
    throw new TestnetProbeError("stellar:ledger");
  }
  if (!Number.isSafeInteger(latestLedger.sequence) || latestLedger.sequence <= 0) {
    throw new TestnetProbeError("stellar:ledger");
  }

  const stellarContracts = [];
  for (const [name, key] of STELLAR_CONTRACTS) {
    const contractId = required(environment, key);
    let methods: readonly unknown[];
    try {
      methods = await stellarRpc.getContractMethods(contractId);
    } catch {
      throw new TestnetProbeError(`stellar:${name}`);
    }
    if (!Array.isArray(methods) || methods.length === 0) {
      throw new TestnetProbeError(`stellar:${name}`);
    }
    stellarContracts.push({ name, methodCount: methods.length });
  }

  return {
    base: { chainId: Number(BigInt(chainId)), contracts: baseContracts },
    stellar: { latestLedger: latestLedger.sequence, contracts: stellarContracts },
  };
}

export function formatTestnetProbe(result: TestnetProbeResult): string {
  return [
    "Telya Testnet public-network probe (no transaction submitted)",
    `READY       Base Sepolia chain ${result.base.chainId}`,
    ...result.base.contracts.map((contract) => `READY       Base ${contract.name} deployed (${contract.byteLength} bytecode bytes)`),
    `READY       Stellar Testnet latest ledger ${result.stellar.latestLedger}`,
    ...result.stellar.contracts.map((contract) => `READY       Stellar ${contract.name} deployed (${contract.methodCount} methods)`),
    "READ ONLY   No balance, allowance, signature, transaction, attestation or finality was verified.",
  ].join("\n");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    console.log(formatTestnetProbe(await probeTestnet()));
  } catch (error) {
    console.error(error instanceof TestnetProbeError ? error.message : "Testnet readiness probe failed; no transaction was submitted.");
    process.exitCode = 1;
  }
}
