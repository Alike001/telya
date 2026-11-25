import { Buffer } from "node:buffer";

import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  SmartAccountLifecycleError,
  connectSmartAccount,
  createSmartAccount,
  restoreSmartAccount,
  validateSmartAccountPublicConfig,
  type SmartAccountLifecycleKit,
  type SmartAccountPublicConfig,
} from "./smart-account";

const publicConfig: SmartAccountPublicConfig = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  accountWasmHash:
    "c514d35ea67eaea9bfc1fb3327854c0c06111bc1ddebd4fe217c504c1004b9e1",
  webauthnVerifierAddress: StrKey.encodeContract(Buffer.alloc(32, 1)),
  relayerUrl: "/api/stellar/relayer",
};

function lifecycleKit(
  overrides: Partial<SmartAccountLifecycleKit> = {},
): SmartAccountLifecycleKit {
  return {
    isConnected: true,
    contractId: "CSMART",
    credentialId: "credential",
    createWallet: vi.fn(),
    connectWallet: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  };
}

describe("validateSmartAccountPublicConfig", () => {
  it("accepts the configured Testnet account artifacts", () => {
    expect(validateSmartAccountPublicConfig(publicConfig)).toEqual(publicConfig);
  });

  it("rejects a malformed account WASM hash", () => {
    expect(() =>
      validateSmartAccountPublicConfig({
        ...publicConfig,
        accountWasmHash: "unapproved",
      }),
    ).toThrowError(SmartAccountLifecycleError);
  });

  it("requires a relayer endpoint instead of accepting browser secrets", () => {
    expect(() =>
      validateSmartAccountPublicConfig({
        ...publicConfig,
        relayerUrl: " ",
      }),
    ).toThrow("relayerUrl is required");
  });
});

describe("smart-account lifecycle", () => {
  it("silently restores a persisted session", async () => {
    const connectWallet = vi.fn().mockResolvedValue({
      contractId: "CRESTORED",
      credentialId: "restored-credential",
    });

    await expect(
      restoreSmartAccount(lifecycleKit({ connectWallet })),
    ).resolves.toEqual({
      contractId: "CRESTORED",
      credentialId: "restored-credential",
    });
    expect(connectWallet).toHaveBeenCalledWith();
  });

  it("prompts for a passkey when reconnecting", async () => {
    const connectWallet = vi.fn().mockResolvedValue({
      contractId: "CCONNECTED",
      credentialId: "connected-credential",
    });

    await connectSmartAccount(lifecycleKit({ connectWallet }));

    expect(connectWallet).toHaveBeenCalledWith({ prompt: true });
  });

  it("forces account deployment through the relayer", async () => {
    const createWallet = vi.fn().mockResolvedValue({
      contractId: "CCREATED",
      credentialId: "created-credential",
      publicKey: new Uint8Array(),
      rawResponse: {},
      submitResult: { success: true, hash: "tx-hash" },
    });

    await createSmartAccount(lifecycleKit({ createWallet }), "alice");

    expect(createWallet).toHaveBeenCalledWith("Telya", "alice", {
      autoSubmit: true,
      forceMethod: "relayer",
    });
  });

  it("does not report a failed deployment as connected", async () => {
    const createWallet = vi.fn().mockResolvedValue({
      contractId: "CFAILED",
      credentialId: "failed-credential",
      publicKey: new Uint8Array(),
      rawResponse: {},
      submitResult: {
        success: false,
        error: new Error("relayer unavailable"),
      },
    });

    await expect(
      createSmartAccount(lifecycleKit({ createWallet }), "alice"),
    ).rejects.toMatchObject({ code: "DEPLOYMENT_FAILED" });
  });
});
