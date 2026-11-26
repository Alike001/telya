import { rpc, StrKey, Networks } from "@stellar/stellar-sdk";

import { stellarUsdcAmountFromRawUnits } from "../../src/stellar/usdc.ts";

export interface TokenBalanceReader {
  queryContract<T>(
    contractId: string,
    method: string,
    args: Record<string, unknown>,
    networkPassphrase: string,
  ): Promise<{ result: T; isReadCall: boolean }>;
}

export function stellarBalanceReaderFromEnvironment(): {
  reader: TokenBalanceReader;
  tokenContract: string;
} {
  const rpcUrl = process.env.STELLAR_RPC_URL;
  const tokenContract = process.env.STELLAR_USDC_SAC;
  if (!rpcUrl || !tokenContract || !StrKey.isValidContract(tokenContract) ||
      process.env.STELLAR_NETWORK_PASSPHRASE !== Networks.TESTNET) {
    throw new Error("Stellar Testnet balance service is unavailable");
  }
  const parsed = new URL(rpcUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("Stellar Testnet RPC URL is unavailable");
  }
  return { reader: new rpc.Server(parsed.toString()), tokenContract };
}

/** Return only a read-only on-chain USDC balance; never substitute zero on failure. */
export async function readStellarUsdcBalance(input: {
  reader: TokenBalanceReader;
  tokenContract: string;
  address: string;
}): Promise<string> {
  if (!StrKey.isValidContract(input.tokenContract) ||
      !(StrKey.isValidContract(input.address) || StrKey.isValidEd25519PublicKey(input.address))) {
    throw new Error("Invalid Stellar balance address");
  }
  const result = await input.reader.queryContract<bigint>(
    input.tokenContract,
    "balance",
    { id: input.address },
    Networks.TESTNET,
  );
  if (!result.isReadCall || typeof result.result !== "bigint" || result.result < 0n) {
    throw new Error("Stellar balance query was not a valid read-only result");
  }
  return stellarUsdcAmountFromRawUnits(result.result);
}
