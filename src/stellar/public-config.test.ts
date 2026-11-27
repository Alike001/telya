import { describe, expect, it } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";

import { smartAccountPublicConfigFromEnvironment } from "./public-config";

function contract(byte: number): string {
  return StrKey.encodeContract(Buffer.alloc(32, byte));
}

const environment = {
  NODE_ENV: "test",
  STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
  STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  STELLAR_ACCOUNT_WASM_HASH: "ab".repeat(32),
  STELLAR_WEBAUTHN_VERIFIER: contract(1),
  STELLAR_ED25519_VERIFIER: contract(2),
  STELLAR_SPENDING_LIMIT_POLICY: contract(3),
  STELLAR_USDC_SAC: contract(4),
} satisfies NodeJS.ProcessEnv;

describe("public Stellar configuration", () => {
  it("always exposes the protected same-origin deployment relayer", () => {
    const config = smartAccountPublicConfigFromEnvironment({
      ...environment,
      STELLAR_RELAYER_URL: "/api/stellar/relayer",
      STELLAR_DEPLOYMENT_RELAYER_URL: "https://attacker.test/relayer",
    });
    expect(config.relayerUrl).toBe("/api/stellar/relayer/deployment");
  });
});
