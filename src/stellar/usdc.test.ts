import { Buffer } from "node:buffer";

import {
  Keypair,
  StrKey,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { SubmissionError } from "smart-account-kit";
import { describe, expect, it, vi } from "vitest";

import {
  StellarUsdcValidationError,
  normalizeStellarUsdcAmount,
  submitStellarUsdcTransfer,
  verifyStellarUsdcTransfer,
  type StellarTransactionRpc,
  type StellarUsdcTransferKit,
} from "./usdc";

const tokenContract = StrKey.encodeContract(Buffer.alloc(32, 1));
const sender = StrKey.encodeContract(Buffer.alloc(32, 2));
const recipient = Keypair.random().publicKey();
const otherRecipient = Keypair.random().publicKey();
const txHash = "ab".repeat(32);

function transferEvent(input: {
  readonly to: string;
  readonly amountRaw: bigint;
}): xdr.ContractEvent {
  return new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: StrKey.decodeContract(
      tokenContract,
    ) as unknown as xdr.Hash,
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(
      0,
      new xdr.ContractEventV0({
        topics: [
          nativeToScVal("transfer", { type: "symbol" }),
          nativeToScVal(sender, { type: "address" }),
          nativeToScVal(input.to, { type: "address" }),
          nativeToScVal("USDC:test", { type: "string" }),
        ],
        data: nativeToScVal(input.amountRaw, { type: "i128" }),
      }),
    ),
  });
}

function rpcResult(
  result: Awaited<ReturnType<StellarTransactionRpc["getTransaction"]>>,
): StellarTransactionRpc {
  return { getTransaction: vi.fn().mockResolvedValue(result) };
}

describe("normalizeStellarUsdcAmount", () => {
  it("normalizes decimal strings without losing atomic units", () => {
    expect(normalizeStellarUsdcAmount("005.1200000")).toEqual({
      decimal: "5.12",
      number: 5.12,
      raw: 51_200_000n,
    });
  });

  it("rejects precision beyond Stellar USDC decimals", () => {
    expect(() => normalizeStellarUsdcAmount("1.00000001")).toThrowError(
      StellarUsdcValidationError,
    );
  });
});

describe("submitStellarUsdcTransfer", () => {
  it("forces the Smart Account Kit transfer through the relayer", async () => {
    const transfer = vi.fn().mockResolvedValue({
      success: true,
      hash: txHash,
      ledger: 123,
    });
    const kit: StellarUsdcTransferKit = { transfer };

    await expect(
      submitStellarUsdcTransfer({
        kit,
        tokenContract,
        recipient,
        amount: "5",
      }),
    ).resolves.toEqual({
      status: "submitted",
      txHash,
      ledger: 123,
      recipient,
      amount: "5",
    });

    expect(transfer).toHaveBeenCalledWith(tokenContract, recipient, 5, {
      forceMethod: "relayer",
    });
  });

  it("preserves an expected SDK failure as failed, never submitted", async () => {
    const kit: StellarUsdcTransferKit = {
      transfer: vi.fn().mockResolvedValue({
        success: false,
        error: new SubmissionError("relayer unavailable"),
      }),
    };

    await expect(
      submitStellarUsdcTransfer({
        kit,
        tokenContract,
        recipient,
        amount: "5",
      }),
    ).resolves.toMatchObject({
      status: "failed",
      message: "relayer unavailable",
      txHash: null,
    });
  });
});

describe("verifyStellarUsdcTransfer", () => {
  it("keeps a transaction pending while RPC cannot find finality", async () => {
    await expect(
      verifyStellarUsdcTransfer({
        rpc: rpcResult({ status: "NOT_FOUND" }),
        txHash,
        tokenContract,
        expectedSender: sender,
        expectedRecipient: recipient,
        expectedAmount: "5",
      }),
    ).resolves.toEqual({ status: "pending", txHash });
  });

  it("verifies finality, token, sender, recipient, and raw amount", async () => {
    await expect(
      verifyStellarUsdcTransfer({
        rpc: rpcResult({
          status: "SUCCESS",
          ledger: 456,
          events: {
            contractEventsXdr: [
              [transferEvent({ to: recipient, amountRaw: 50_000_000n })],
            ],
          },
        }),
        txHash,
        tokenContract,
        expectedSender: sender,
        expectedRecipient: recipient,
        expectedAmount: "5",
      }),
    ).resolves.toEqual({
      status: "verified",
      txHash,
      ledger: 456,
      sender,
      recipient,
      amount: "5",
    });
  });

  it("reports the actual recipient when it does not match", async () => {
    await expect(
      verifyStellarUsdcTransfer({
        rpc: rpcResult({
          status: "SUCCESS",
          ledger: 456,
          events: {
            contractEventsXdr: [
              [transferEvent({ to: otherRecipient, amountRaw: 50_000_000n })],
            ],
          },
        }),
        txHash,
        tokenContract,
        expectedSender: sender,
        expectedRecipient: recipient,
        expectedAmount: "5",
      }),
    ).resolves.toMatchObject({
      status: "mismatch",
      reason: "recipient_mismatch",
      actualRecipient: otherRecipient,
      actualAmount: "5",
    });
  });

  it("reports the actual amount when it does not match", async () => {
    await expect(
      verifyStellarUsdcTransfer({
        rpc: rpcResult({
          status: "SUCCESS",
          ledger: 456,
          events: {
            contractEventsXdr: [
              [transferEvent({ to: recipient, amountRaw: 49_000_000n })],
            ],
          },
        }),
        txHash,
        tokenContract,
        expectedSender: sender,
        expectedRecipient: recipient,
        expectedAmount: "5",
      }),
    ).resolves.toMatchObject({
      status: "mismatch",
      reason: "amount_mismatch",
      actualRecipient: recipient,
      actualAmount: "4.9",
    });
  });
});
