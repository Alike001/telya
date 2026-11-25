import { Buffer } from "node:buffer";

import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
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
  usdcContract: StrKey.encodeContract(Buffer.alloc(32, 2)),
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

  it("rejects a non-contract USDC asset configuration", () => {
    expect(() =>
      validateSmartAccountPublicConfig({
        ...publicConfig,
        usdcContract: Keypair.random().publicKey(),
      }),
    ).toThrow("usdcContract must be a valid Stellar contract address");
  });

  it("rejects a non-Testnet network instead of silently switching networks", () => {
    expect(() =>
      validateSmartAccountPublicConfig({
        ...publicConfig,
        networkPassphrase: Networks.PUBLIC,
      }),
    ).toThrow("restricted to Stellar Testnet");
  });

  it("rejects RPC URLs that could expose embedded credentials", () => {
    expect(() =>
      validateSmartAccountPublicConfig({
        ...publicConfig,
        rpcUrl: "https://user:secret@example.com",
      }),
    ).toThrow("credential-free HTTPS URL");
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

  it("restores the same persisted account after a simulated page refresh", async () => {
    const storedAccount = {
      contractId: "CREFRESHED",
      credentialId: "persisted-credential",
    };
    const connectWallet = vi.fn().mockResolvedValue(storedAccount);
    const firstPageKit = lifecycleKit({ connectWallet });
    const refreshedPageKit = lifecycleKit({ connectWallet });

    await expect(restoreSmartAccount(firstPageKit)).resolves.toEqual(
      storedAccount,
    );
    await expect(restoreSmartAccount(refreshedPageKit)).resolves.toEqual(
      storedAccount,
    );
    expect(connectWallet).toHaveBeenCalledTimes(2);
  });

  it("prompts for a passkey when reconnecting", async () => {
    const connectWallet = vi.fn().mockResolvedValue({
      contractId: "CCONNECTED",
      credentialId: "connected-credential",
    });

    await connectSmartAccount(lifecycleKit({ connectWallet }));

    expect(connectWallet).toHaveBeenCalledWith({ prompt: true });
  });

  it("restores account state through a prompted re-login", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const connectWallet = vi.fn().mockResolvedValue({
      contractId: "CRELOGIN",
      credentialId: "relogin-credential",
    });
    const kit = lifecycleKit({ connectWallet, disconnect });

    await kit.disconnect();
    await expect(connectSmartAccount(kit)).resolves.toEqual({
      contractId: "CRELOGIN",
      credentialId: "relogin-credential",
    });
    expect(disconnect).toHaveBeenCalledOnce();
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

    await expect(
      createSmartAccount(lifecycleKit({ createWallet }), "alice"),
    ).resolves.toEqual({
      contractId: "CCREATED",
      credentialId: "created-credential",
      deploymentTransactionHash: "tx-hash",
    });

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
