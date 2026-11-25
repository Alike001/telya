import { Buffer } from "node:buffer";

import { Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import type { SmartAccountKit } from "smart-account-kit";
import { describe, expect, it, vi } from "vitest";

import {
  OWNER_CONTEXT_RULE_ID,
  createStellarAgentPass,
  getAgentPassSpending,
  revokeStellarAgentPass,
  submitAgentPassTransfer,
} from "./agent-pass";

const smartAccount = StrKey.encodeContract(Buffer.alloc(32, 1));
const tokenContract = StrKey.encodeContract(Buffer.alloc(32, 2));
const ed25519VerifierAddress = StrKey.encodeContract(Buffer.alloc(32, 3));
const spendingLimitPolicyAddress = StrKey.encodeContract(Buffer.alloc(32, 4));
const agentAddress = Keypair.random().publicKey();
const txHash = "ab".repeat(32);

function kitMock() {
  const add = vi.fn().mockResolvedValue({ result: { id: 2 } });
  const remove = vi.fn().mockResolvedValue({ result: null });
  const transfer = vi.fn().mockResolvedValue({
    success: true,
    hash: txHash,
    ledger: 123,
  });
  const signer = {
    tag: "External",
    values: [ed25519VerifierAddress, Buffer.alloc(32, 9)],
  };
  const selected = [{
    type: "ed25519",
    ed25519PublicKey: Buffer.alloc(32, 9).toString("hex"),
    signer,
  }];
  const kit = {
    contractId: smartAccount,
    rpc: { getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1_000 }) },
    externalSigners: {
      addEd25519FromSecret: vi.fn().mockReturnValue({
        address: agentAddress,
        publicKey: Buffer.alloc(32, 9).toString("hex"),
      }),
      remove: vi.fn(),
    },
    convertPolicyParams: vi.fn().mockReturnValue(xdr.ScVal.scvMap([])),
    rules: { add, remove },
    signAndSubmitAdmin: vi.fn().mockResolvedValue({
      success: true,
      hash: txHash,
      ledger: 123,
    }),
    multiSigners: {
      buildSelectedSigners: vi.fn().mockReturnValue(selected),
      transfer,
    },
    policyClients: {
      spendingLimit: vi.fn().mockReturnValue({
        getSpendingLimitData: vi.fn().mockResolvedValue({
          spending_limit: 10_000_000n,
          period_ledgers: 720,
          spending_history: [],
          cached_total_spent: 4_000_000n,
        }),
      }),
    },
  };
  return { kit: kit as unknown as SmartAccountKit, add, remove, transfer };
}

describe("Stellar Agent Pass", () => {
  it("creates a USDC-scoped, expiring spending rule with owner authorization", async () => {
    const { kit, add } = kitMock();
    const pass = await createStellarAgentPass({
      kit,
      tokenContract,
      ed25519VerifierAddress,
      spendingLimitPolicyAddress,
      spendingLimit: "1",
      durationLedgers: 720,
    });

    expect(pass).toMatchObject({
      smartAccount,
      ruleId: 2,
      spendingLimit: "1",
      spendingLimitAtomic: 10_000_000n,
      validUntilLedger: 1_720,
      createTransactionHash: txHash,
    });
    expect(add).toHaveBeenCalledWith(
      { tag: "CallContract", values: [tokenContract] },
      "Telya Agent Pass",
      expect.any(Array),
      new Map([[spendingLimitPolicyAddress, expect.anything()]]),
      1_720,
    );
    expect(kit.signAndSubmitAdmin).toHaveBeenCalledWith(expect.anything(), {
      forceMethod: "relayer",
      resolveContextRuleIds: expect.any(Function),
    });
    const options = vi.mocked(kit.signAndSubmitAdmin).mock.calls[0]?.[1];
    expect(
      await Promise.resolve(options?.resolveContextRuleIds?.({} as never, 0)),
    ).toEqual([OWNER_CONTEXT_RULE_ID]);
    expect(pass).not.toHaveProperty("secret");
  });

  it("binds an agent transfer to the created rule", async () => {
    const { kit, transfer } = kitMock();
    const pass = await createStellarAgentPass({
      kit,
      tokenContract,
      ed25519VerifierAddress,
      spendingLimitPolicyAddress,
      spendingLimit: "1",
    });
    await submitAgentPassTransfer({
      kit,
      pass,
      tokenContract,
      recipient: Keypair.random().publicKey(),
      amount: "0.25",
    });
    expect(transfer).toHaveBeenCalledWith(
      tokenContract,
      expect.any(String),
      0.25,
      expect.any(Array),
      expect.objectContaining({ forceMethod: "relayer" }),
    );
    const options = transfer.mock.calls[0]?.[4];
    expect(await Promise.resolve(options.resolveContextRuleIds())).toEqual([2]);
  });

  it("reads cumulative on-chain spending and revokes with the owner rule", async () => {
    const { kit, remove } = kitMock();
    await expect(
      getAgentPassSpending({ kit, spendingLimitPolicyAddress, ruleId: 2 }),
    ).resolves.toEqual({
      spendingLimitAtomic: 10_000_000n,
      spentAtomic: 4_000_000n,
      remainingAtomic: 6_000_000n,
      periodLedgers: 720,
    });
    await expect(
      revokeStellarAgentPass({ kit, pass: { ruleId: 2 } }),
    ).resolves.toEqual({ transactionHash: txHash });
    expect(remove).toHaveBeenCalledWith(2);
  });
});
