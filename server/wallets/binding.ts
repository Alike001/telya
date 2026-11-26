import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { Networks, rpc, StrKey, xdr } from "@stellar/stellar-sdk";
import type { AuthenticatedUser } from "../auth/privy.ts";
import { getSqlClient } from "../db/client.ts";

const PROOF_LIFETIME_MS = 5 * 60_000;
const MAX_CREDENTIAL_BYTES = 1024;

export class WalletBindingError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "WalletBindingError";
  }
}

type BindingConfig = {
  readonly secret: string;
  readonly rpcUrl: string;
  readonly wasmHash: string;
  readonly verifier: string;
  readonly rpId: string;
  readonly origins: readonly string[];
};

function configFromEnvironment(): BindingConfig {
  const secret = process.env.PRIVY_APP_SECRET;
  const rpcUrl = process.env.STELLAR_RPC_URL;
  const wasmHash = process.env.STELLAR_ACCOUNT_WASM_HASH?.toLowerCase();
  const verifier = process.env.STELLAR_WEBAUTHN_VERIFIER;
  const rpId = process.env.STELLAR_WEBAUTHN_RP_ID;
  const origins = process.env.STELLAR_WEBAUTHN_ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  if (!secret || !rpcUrl || !wasmHash || !verifier || !rpId || !origins.length ||
      !/^[a-f0-9]{64}$/.test(wasmHash) || !StrKey.isValidContract(verifier)) {
    throw new WalletBindingError("wallet_binding_unavailable", 503);
  }
  let parsed: URL;
  try { parsed = new URL(rpcUrl); } catch { throw new WalletBindingError("wallet_binding_unavailable", 503); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      origins.some((origin) => {
        try {
          const url = new URL(origin);
          const localHttp = url.protocol === "http:" &&
            (url.hostname === "localhost" || url.hostname === "127.0.0.1");
          return (url.protocol !== "https:" && !localHttp) || url.origin !== origin ||
            !(url.hostname === rpId || url.hostname.endsWith(`.${rpId}`));
        } catch { return true; }
      })) throw new WalletBindingError("wallet_binding_unavailable", 503);
  return { secret, rpcUrl: parsed.toString(), wasmHash, verifier, rpId, origins };
}

function credentialBytes(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]{16,2048}$/.test(value)) throw new WalletBindingError("invalid_credential", 400);
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 12 || bytes.length > MAX_CREDENTIAL_BYTES || bytes.toString("base64url") !== value) {
    throw new WalletBindingError("invalid_credential", 400);
  }
  return bytes;
}

type Proof = {
  v: 1;
  userId: string;
  sessionId: string;
  contractId: string;
  credentialId: string;
  challenge: string;
  expiresAt: number;
};

function signProof(proof: Proof, secret: string): string {
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  const mac = createHmac("sha256", secret).update("telya.wallet-binding.v1:").update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyWalletBindingToken(token: string, user: AuthenticatedUser, secret: string): Proof {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1] || token.length > 4096) {
    throw new WalletBindingError("invalid_wallet_proof", 400);
  }
  const expected = createHmac("sha256", secret).update("telya.wallet-binding.v1:").update(parts[0]).digest();
  const actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new WalletBindingError("invalid_wallet_proof", 400);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw new WalletBindingError("invalid_wallet_proof", 400); }
  const proof = parsed as Partial<Proof> | null;
  if (!proof || proof.v !== 1 || proof.userId !== user.id || proof.sessionId !== user.sessionId ||
      typeof proof.contractId !== "string" || !StrKey.isValidContract(proof.contractId) ||
      typeof proof.credentialId !== "string" || typeof proof.challenge !== "string" ||
      !Number.isSafeInteger(proof.expiresAt) || proof.expiresAt! < Date.now() ||
      proof.expiresAt! > Date.now() + PROOF_LIFETIME_MS) {
    throw new WalletBindingError("invalid_wallet_proof", 400);
  }
  credentialBytes(proof.credentialId);
  if (Buffer.from(proof.challenge, "base64url").length !== 32) throw new WalletBindingError("invalid_wallet_proof", 400);
  return proof as Proof;
}

export function createWalletBindingChallenge(user: AuthenticatedUser, contractId: string, credentialId: string) {
  const config = configFromEnvironment();
  if (!StrKey.isValidContract(contractId)) throw new WalletBindingError("invalid_wallet", 400);
  credentialBytes(credentialId);
  const proof: Proof = {
    v: 1,
    userId: user.id,
    sessionId: user.sessionId,
    contractId,
    credentialId,
    challenge: randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + PROOF_LIFETIME_MS,
  };
  return { challenge: proof.challenge, proofToken: signProof(proof, config.secret), rpId: config.rpId, expiresAt: proof.expiresAt };
}

export type WalletAssertion = {
  readonly id: string;
  readonly response: {
    readonly authenticatorData: string;
    readonly clientDataJSON: string;
    readonly signature: string;
  };
};

export function verifyWalletAssertion(
  assertion: WalletAssertion,
  proof: Pick<Proof, "challenge" | "credentialId">,
  publicKey: Uint8Array,
  policy: Pick<BindingConfig, "rpId" | "origins">,
): boolean {
  try {
    if (assertion.id !== proof.credentialId || publicKey.length !== 65 || publicKey[0] !== 4) return false;
    const clientBytes = Buffer.from(assertion.response.clientDataJSON, "base64url");
    const clientData = JSON.parse(clientBytes.toString("utf8")) as Record<string, unknown>;
    if (clientData.type !== "webauthn.get" || clientData.challenge !== proof.challenge ||
        typeof clientData.origin !== "string" || !policy.origins.includes(clientData.origin) ||
        clientData.crossOrigin === true) return false;
    const authData = Buffer.from(assertion.response.authenticatorData, "base64url");
    if (authData.length < 37 || !timingSafeEqual(authData.subarray(0, 32), createHash("sha256").update(policy.rpId).digest())) return false;
    if ((authData[32]! & 0x05) !== 0x05) return false; // User Present and User Verified.
    const key = createPublicKey({
      key: {
        kty: "EC", crv: "P-256",
        x: Buffer.from(publicKey.subarray(1, 33)).toString("base64url"),
        y: Buffer.from(publicKey.subarray(33, 65)).toString("base64url"),
      },
      format: "jwk",
    });
    const signed = Buffer.concat([authData, createHash("sha256").update(clientBytes).digest()]);
    return verify("sha256", signed, key, Buffer.from(assertion.response.signature, "base64url"));
  } catch { return false; }
}

async function readLivePasskey(contractId: string, credentialId: string, config: BindingConfig): Promise<Uint8Array> {
  const server = new rpc.Server(config.rpcUrl);
  const instance = await server.getContractData(contractId, xdr.ScVal.scvLedgerKeyContractInstance());
  const executable = instance.val.contractData().val().instance().executable();
  if (executable.switch().name !== "contractExecutableWasm" ||
      Buffer.from(executable.wasmHash()).toString("hex") !== config.wasmHash) {
    throw new WalletBindingError("wallet_code_unrecognized", 403);
  }
  const [query, ledger] = await Promise.all([
    server.queryContract<{
      id: number;
      context_type: { tag: string };
      signers: Array<{ tag: string; values: [string, Uint8Array] }>;
      valid_until: number | null;
    }>(contractId, "get_context_rule", { context_rule_id: 0 }, Networks.TESTNET),
    server.getLatestLedger(),
  ]);
  const rule = query.result;
  if (!query.isReadCall || rule?.id !== 0 || rule.context_type?.tag !== "Default" ||
      !Number.isSafeInteger(ledger.sequence) ||
      (rule.valid_until !== null && (!Number.isSafeInteger(rule.valid_until) || rule.valid_until < ledger.sequence)) ||
      !Array.isArray(rule.signers)) {
    throw new WalletBindingError("wallet_signer_unavailable", 403);
  }
  const expectedCredential = credentialBytes(credentialId);
  const matches = rule.signers.filter((signer) => {
    if (signer.tag !== "External" || signer.values?.[0] !== config.verifier) return false;
    const keyData = Buffer.from(signer.values[1]);
    return keyData.length === 65 + expectedCredential.length && keyData[0] === 4 &&
      timingSafeEqual(keyData.subarray(65), expectedCredential);
  });
  if (matches.length !== 1) throw new WalletBindingError("wallet_signer_unavailable", 403);
  return Buffer.from(matches[0]!.values[1]).subarray(0, 65);
}

/** Verify a fresh passkey assertion against an active on-chain signer before binding. */
export async function bindVerifiedStellarWallet(user: AuthenticatedUser, token: string, assertion: WalletAssertion) {
  const config = configFromEnvironment();
  const proof = verifyWalletBindingToken(token, user, config.secret);
  let publicKey: Uint8Array;
  try { publicKey = await readLivePasskey(proof.contractId, proof.credentialId, config); }
  catch (error) {
    if (error instanceof WalletBindingError) throw error;
    throw new WalletBindingError("wallet_verification_unavailable", 503);
  }
  if (!verifyWalletAssertion(assertion, proof, publicKey, config)) {
    throw new WalletBindingError("wallet_proof_rejected", 403);
  }
  const sql = getSqlClient();
  const rows = await sql`
    INSERT INTO wallets (user_id, network, address, normalized_address, verification_status, verified_at)
    VALUES (${user.id}::uuid, 'stellar', ${proof.contractId}, ${proof.contractId}, 'verified', now())
    ON CONFLICT (network, normalized_address) DO UPDATE
    SET verification_status = 'verified', verified_at = COALESCE(wallets.verified_at, now())
    WHERE wallets.user_id = EXCLUDED.user_id
    RETURNING id, address
  `;
  if (!rows[0]) throw new WalletBindingError("wallet_bound_to_other_user", 409);
  return { walletId: String(rows[0].id), address: String(rows[0].address) };
}
