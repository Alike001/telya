import { Buffer } from "node:buffer";

import {
  Account,
  Address,
  Contract,
  Networks,
  StrKey,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  CCTP_BASE_DOMAIN,
  CCTP_FORWARDING_SERVICE_HOOK,
  CCTP_STANDARD_FINALITY_THRESHOLD,
  CCTP_STELLAR_DOMAIN,
  StellarCctpError,
  buildMintAndForwardOperation,
  bytes32ToEvmAddress,
  evmAddressToBytes32,
  prepareStellarCctpBurn,
  submitStellarCctpBurn,
  stellarContractToBytes32,
  validateStellarCctpConfig,
  verifyStellarCctpBurn,
  type StellarCctpConfig,
} from "./cctp";

const SMART_ACCOUNT = "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F";
const SPONSOR = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const RECIPIENT = "0x1111111111111111111111111111111111111111";
const TEST_CONTRACT = (byte: number) =>
  StrKey.encodeContract(Buffer.alloc(32, byte));

const config: StellarCctpConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  usdcContract: TEST_CONTRACT(1),
  tokenMessenger: TEST_CONTRACT(2),
  messageTransmitter: TEST_CONTRACT(3),
  forwarder: TEST_CONTRACT(4),
  baseDomain: CCTP_BASE_DOMAIN,
  stellarDomain: CCTP_STELLAR_DOMAIN,
};

function finalizedBurnEnvelope(): xdr.TransactionEnvelope {
  const prepared = prepareStellarCctpBurn(config, {
    smartAccount: SMART_ACCOUNT,
    recipient: RECIPIENT,
    burnAmount: "5.12",
    maxFee: "0.01",
  });
  const invoke = new Contract(SMART_ACCOUNT).call(
    "execute",
    new Address(config.tokenMessenger).toScVal(),
    xdr.ScVal.scvString("deposit_for_burn_with_hook"),
    xdr.ScVal.scvVec([...prepared.targetArgs]),
  );
  return new TransactionBuilder(new Account(SPONSOR, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(invoke)
    .setTimeout(60)
    .build()
    .toEnvelope();
}

describe("Stellar CCTP configuration", () => {
  it("accepts the production-shaped Testnet contract configuration", () => {
    expect(validateStellarCctpConfig(config)).toMatchObject({
      baseDomain: 6,
      stellarDomain: 27,
      networkPassphrase: Networks.TESTNET,
    });
  });

  it("encodes a validated Stellar contract as Circle bytes32", () => {
    expect(stellarContractToBytes32(TEST_CONTRACT(4))).toBe(`0x${"04".repeat(32)}`);
    expect(() => stellarContractToBytes32(SPONSOR)).toThrow("contract address");
  });

  it("fails closed on a wrong CCTP domain or network", () => {
    expect(() => validateStellarCctpConfig({ ...config, baseDomain: 3 })).toThrow(
      StellarCctpError,
    );
    expect(() =>
      validateStellarCctpConfig({ ...config, networkPassphrase: Networks.PUBLIC }),
    ).toThrow("restricted to Stellar Testnet");
  });
});

describe("CCTP address encoding", () => {
  it("round-trips a Base address through bytes32", () => {
    const encoded = evmAddressToBytes32(RECIPIENT);
    expect(encoded).toHaveLength(32);
    expect(encoded.subarray(0, 12)).toEqual(Buffer.alloc(12));
    expect(bytes32ToEvmAddress(encoded)).toBe(RECIPIENT);
  });

  it("rejects malformed or non-zero-padded addresses", () => {
    expect(() => evmAddressToBytes32("0x1234")).toThrow(StellarCctpError);
    expect(() => bytes32ToEvmAddress(Buffer.alloc(32, 1))).toThrow(
      "zero-padded EVM address",
    );
  });
});

describe("Stellar to Base source burn", () => {
  it("builds the exact Standard CCTP invocation arguments", () => {
    const burn = prepareStellarCctpBurn(config, {
      smartAccount: SMART_ACCOUNT,
      recipient: RECIPIENT,
      burnAmount: "5.12",
      maxFee: "0.01",
    });
    expect(burn.amountRaw).toBe(51_200_000n);
    expect(burn.maxFeeRaw).toBe(100_000n);
    expect(burn.targetArgs[2]?.u32()).toBe(CCTP_BASE_DOMAIN);
    expect(burn.targetArgs[3]?.bytes()).toEqual(evmAddressToBytes32(RECIPIENT));
    expect(burn.targetArgs[5]?.bytes()).toEqual(Buffer.alloc(32));
    expect(burn.targetArgs[7]?.u32()).toBe(CCTP_STANDARD_FINALITY_THRESHOLD);
    expect(burn.targetArgs[8]?.bytes()).toEqual(CCTP_FORWARDING_SERVICE_HOOK);
  });

  it("allows a zero max fee when Circle's trusted quote is zero", () => {
    const burn = prepareStellarCctpBurn(config, {
      smartAccount: SMART_ACCOUNT,
      recipient: RECIPIENT,
      burnAmount: "5.12",
      maxFee: "0",
    });
    expect(burn.maxFeeRaw).toBe(0n);
  });

  it("requires explicit owner authorization through the relayer", async () => {
    const executeAndSubmit = vi.fn().mockResolvedValue({
      success: true,
      hash: "a".repeat(64),
      ledger: 123,
    });
    const result = await submitStellarCctpBurn({
      kit: { contractId: SMART_ACCOUNT, executeAndSubmit },
      config,
      recipient: RECIPIENT,
      burnAmount: "5.12",
      maxFee: "0.01",
    });
    expect(result.txHash).toBe("a".repeat(64));
    expect(executeAndSubmit).toHaveBeenCalledWith(
      config.tokenMessenger,
      "deposit_for_burn_with_hook",
      expect.any(Array),
      expect.objectContaining({ forceMethod: "relayer" }),
    );
    expect(executeAndSubmit.mock.calls[0]?.[3].resolveContextRuleIds()).toEqual([0]);
  });

  it("verifies finalized source evidence without treating it as completion", async () => {
    const verification = await verifyStellarCctpBurn({
      rpc: {
        getTransaction: vi.fn().mockResolvedValue({
          status: "SUCCESS",
          ledger: 456,
          envelopeXdr: finalizedBurnEnvelope(),
        }),
      } as never,
      txHash: "b".repeat(64),
      config,
      intent: {
        smartAccount: SMART_ACCOUNT,
        recipient: RECIPIENT,
        burnAmount: "5.12",
        maxFee: "0.01",
      },
    });
    expect(verification).toEqual({
      status: "verified",
      txHash: "b".repeat(64),
      ledger: 456,
      amountRaw: 51_200_000n,
      recipient: RECIPIENT,
    });
    expect(verification).not.toHaveProperty("completed");
  });

  it("rejects a finalized burn whose recipient differs", async () => {
    const verification = await verifyStellarCctpBurn({
      rpc: {
        getTransaction: vi.fn().mockResolvedValue({
          status: "SUCCESS",
          ledger: 456,
          envelopeXdr: finalizedBurnEnvelope(),
        }),
      } as never,
      txHash: "c".repeat(64),
      config,
      intent: {
        smartAccount: SMART_ACCOUNT,
        recipient: "0x2222222222222222222222222222222222222222",
        burnAmount: "5.12",
        maxFee: "0.01",
      },
    });
    expect(verification.status).toBe("mismatch");
  });
});

describe("Base to Stellar destination", () => {
  it("builds only the Circle forwarder's mint_and_forward call", () => {
    const operation = buildMintAndForwardOperation({
      config,
      message: "0x0102",
      attestation: "0xaabb",
    });
    const invoke = operation.body().invokeHostFunctionOp().hostFunction().invokeContract();
    expect(Address.fromScAddress(invoke.contractAddress()).toString()).toBe(
      config.forwarder,
    );
    expect(invoke.functionName().toString()).toBe("mint_and_forward");
    expect(invoke.args().map((arg) => Buffer.from(arg.bytes()).toString("hex"))).toEqual([
      "0102",
      "aabb",
    ]);
  });

  it("rejects empty attestation material before submission", () => {
    expect(() =>
      buildMintAndForwardOperation({ config, message: "0x", attestation: "aabb" }),
    ).toThrow("message must be non-empty hexadecimal bytes");
  });
});
