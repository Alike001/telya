import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindVerifiedBaseWallet,
  createWalletBindingChallenge,
  verifyWalletAssertion,
  verifyWalletBindingToken,
} from "./binding.ts";
import { verifiedPrivyEthereumWallets } from "../auth/privy.ts";

const user = {
  id: "00000000-0000-0000-0000-000000000001",
  privyUserId: "did:privy:verified",
  sessionId: "verified-session",
  expiresAt: new Date(Date.now() + 60_000),
};
const contractId = StrKey.encodeContract(Buffer.alloc(32, 4));
const credentialId = Buffer.alloc(32, 7).toString("base64url");
const rpId = "telya.vercel.app";
const origin = "https://telya.vercel.app";
const secret = "test-only-privy-app-secret";

afterEach(() => vi.unstubAllEnvs());

function configure() {
  vi.stubEnv("PRIVY_APP_SECRET", secret);
  vi.stubEnv("STELLAR_RPC_URL", "https://soroban-testnet.stellar.org");
  vi.stubEnv("STELLAR_ACCOUNT_WASM_HASH", "ab".repeat(32));
  vi.stubEnv("STELLAR_WEBAUTHN_VERIFIER", StrKey.encodeContract(Buffer.alloc(32, 3)));
  vi.stubEnv("STELLAR_WEBAUTHN_RP_ID", rpId);
  vi.stubEnv("STELLAR_WEBAUTHN_ALLOWED_ORIGINS", origin);
}

describe("wallet ownership proof", () => {
  it("accepts only verified Ethereum linked accounts from Privy", () => {
    const address = `0x${"A".repeat(40)}`;
    expect(verifiedPrivyEthereumWallets({ linked_accounts: [
      { type: "wallet", chain_type: "ethereum", address, verified_at: 1 },
      { type: "wallet", chain_type: "solana", address, verified_at: 1 },
      { type: "wallet", chain_type: "ethereum", address: `0x${"b".repeat(40)}`, verified_at: null },
      { type: "email", address: "person@example.com", verified_at: 1 },
    ] })).toEqual([address.toLowerCase()]);
  });

  it("rejects a browser address that Privy does not link to the authenticated user", async () => {
    const address = `0x${"a".repeat(40)}`;
    await expect(bindVerifiedBaseWallet(
      user,
      address,
      async (privyUserId) => {
        expect(privyUserId).toBe(user.privyUserId);
        return [`0x${"b".repeat(40)}`];
      },
    )).rejects.toMatchObject({ code: "wallet_proof_rejected", status: 403 });
  });

  it("binds a fresh challenge to the authenticated user, session, wallet, and credential", () => {
    configure();
    const challenge = createWalletBindingChallenge(user, contractId, credentialId);
    const proof = verifyWalletBindingToken(challenge.proofToken, user, secret);
    expect(proof.contractId).toBe(contractId);
    expect(proof.credentialId).toBe(credentialId);
    expect(proof.challenge).toBe(challenge.challenge);
    expect(challenge.rpId).toBe(rpId);
    expect(Buffer.from(challenge.challenge, "base64url")).toHaveLength(32);
    expect(() => verifyWalletBindingToken(challenge.proofToken, { ...user, sessionId: "other-session" }, secret))
      .toThrow("invalid_wallet_proof");
    expect(() => verifyWalletBindingToken(`${challenge.proofToken}x`, user, secret))
      .toThrow("invalid_wallet_proof");
  });

  it("rejects an expired token and a missing explicit origin policy", () => {
    configure();
    const challenge = createWalletBindingChallenge(user, contractId, credentialId);
    vi.spyOn(Date, "now").mockReturnValue(challenge.expiresAt + 1);
    expect(() => verifyWalletBindingToken(challenge.proofToken, user, secret)).toThrow("invalid_wallet_proof");
    vi.restoreAllMocks();
    vi.stubEnv("STELLAR_WEBAUTHN_ALLOWED_ORIGINS", "");
    expect(() => createWalletBindingChallenge(user, contractId, credentialId)).toThrow("wallet_binding_unavailable");
  });

  it("allows an explicit localhost WebAuthn test origin but rejects remote HTTP", () => {
    configure();
    vi.stubEnv("STELLAR_WEBAUTHN_RP_ID", "localhost");
    vi.stubEnv("STELLAR_WEBAUTHN_ALLOWED_ORIGINS", "http://localhost:3000");
    expect(createWalletBindingChallenge(user, contractId, credentialId).rpId).toBe("localhost");
    vi.stubEnv("STELLAR_WEBAUTHN_RP_ID", "example.com");
    vi.stubEnv("STELLAR_WEBAUTHN_ALLOWED_ORIGINS", "http://example.com");
    expect(() => createWalletBindingChallenge(user, contractId, credentialId)).toThrow("wallet_binding_unavailable");
  });

  it("verifies a WebAuthn assertion against the live-rule key material and rejects altered claims", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = publicKey.export({ format: "jwk" });
    if (typeof jwk.x !== "string" || typeof jwk.y !== "string") throw new Error("P-256 fixture failed");
    const rawPublicKey = Buffer.concat([
      Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url"),
    ]);
    const challenge = Buffer.alloc(32, 9).toString("base64url");
    const authData = Buffer.concat([createHash("sha256").update(rpId).digest(), Buffer.from([5, 0, 0, 0, 1])]);
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin }));
    const signed = Buffer.concat([authData, createHash("sha256").update(clientData).digest()]);
    const assertion = {
      id: credentialId,
      response: {
        authenticatorData: authData.toString("base64url"),
        clientDataJSON: clientData.toString("base64url"),
        signature: sign("sha256", signed, privateKey).toString("base64url"),
      },
    };
    const proof = { challenge, credentialId };
    const policy = { rpId, origins: [origin] };
    expect(verifyWalletAssertion(assertion, proof, rawPublicKey, policy)).toBe(true);
    expect(verifyWalletAssertion(assertion, { ...proof, challenge: "different" }, rawPublicKey, policy)).toBe(false);
    expect(verifyWalletAssertion(assertion, proof, rawPublicKey, { ...policy, origins: ["https://evil.example"] })).toBe(false);
    expect(verifyWalletAssertion(assertion, proof, rawPublicKey, { ...policy, rpId: "other.example" })).toBe(false);
    expect(verifyWalletAssertion({ ...assertion, id: "wrong" }, proof, rawPublicKey, policy)).toBe(false);
    const withoutVerification = Buffer.from(authData);
    withoutVerification[32] = 1;
    expect(verifyWalletAssertion({
      ...assertion,
      response: { ...assertion.response, authenticatorData: withoutVerification.toString("base64url") },
    }, proof, rawPublicKey, policy)).toBe(false);
  });
});
