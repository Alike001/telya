import { describe, expect, it } from "vitest";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import {
  checkEnvironment,
  formatReport,
  parseEnvironmentFile,
} from "./check-environment.mjs";

function validOnboardingEnvironment() {
  return {
    DATABASE_URL: "postgresql://user:password@database.test/telya",
    NEXT_PUBLIC_PRIVY_APP_ID: "privy-public-app-id",
    PRIVY_APP_SECRET: "private-privy-secret",
    STELLAR_FEE_SPONSOR_SECRET: Keypair.random().secret(),
    STELLAR_WEBAUTHN_ALLOWED_ORIGINS: "http://localhost:3000,https://telya.vercel.app",
    STELLAR_WEBAUTHN_RP_ID: "localhost",
    STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
    STELLAR_NETWORK_PASSPHRASE: Networks.TESTNET,
    STELLAR_ACCOUNT_WASM_HASH: "ab".repeat(32),
    STELLAR_WEBAUTHN_VERIFIER: StrKey.encodeContract(Buffer.alloc(32, 1)),
    STELLAR_ED25519_VERIFIER: StrKey.encodeContract(Buffer.alloc(32, 2)),
    STELLAR_SPENDING_LIMIT_POLICY: StrKey.encodeContract(Buffer.alloc(32, 3)),
    STELLAR_USDC_SAC: StrKey.encodeContract(Buffer.alloc(32, 4)),
  };
}

function validCctpEnvironment() {
  return {
    ...validOnboardingEnvironment(),
    CIRCLE_ENV: "testnet",
    CCTP_BASE_DOMAIN: "6",
    CCTP_STELLAR_DOMAIN: "27",
    CCTP_STELLAR_TOKEN_MESSENGER: StrKey.encodeContract(Buffer.alloc(32, 5)),
    CCTP_STELLAR_MESSAGE_TRANSMITTER: StrKey.encodeContract(Buffer.alloc(32, 6)),
    CCTP_STELLAR_FORWARDER: StrKey.encodeContract(Buffer.alloc(32, 7)),
    BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org",
  };
}

describe("environment preflight", () => {
  it("parses quoted values without treating comments as configuration", () => {
    expect(parseEnvironmentFile('# ignored\nA="one"\nexport B=two=three\n')).toEqual({ A: "one", B: "two=three" });
  });

  it("accepts a complete local onboarding configuration", () => {
    const results = checkEnvironment(validOnboardingEnvironment(), "onboarding");
    expect(results.every((result) => result.status === "ready")).toBe(true);
    expect(formatReport(results, "onboarding").ready).toBe(true);
  });

  it("reports empty, placeholder and malformed financial configuration", () => {
    const environment = validOnboardingEnvironment();
    environment.NEXT_PUBLIC_PRIVY_APP_ID = "";
    environment.PRIVY_APP_SECRET = "[SENSITIVE]";
    environment.STELLAR_FEE_SPONSOR_SECRET = "not-a-stellar-secret";

    expect(checkEnvironment(environment, "onboarding")).toEqual(expect.arrayContaining([
      { key: "NEXT_PUBLIC_PRIVY_APP_ID", status: "missing" },
      { key: "PRIVY_APP_SECRET", status: "placeholder" },
      { key: "STELLAR_FEE_SPONSOR_SECRET", status: "invalid" },
    ]));
  });

  it("never includes configured values in its report", () => {
    const environment = validOnboardingEnvironment();
    const report = formatReport(checkEnvironment(environment, "onboarding"), "onboarding").output;
    for (const value of Object.values(environment)) expect(report).not.toContain(value);
  });

  it("rejects a Base RPC URL containing embedded credentials", () => {
    const environment = {
      ...validOnboardingEnvironment(),
      BASE_SEPOLIA_RPC_URL: "https://username:password@base.example.test",
    };
    expect(checkEnvironment(environment, "full")).toContainEqual({ key: "BASE_SEPOLIA_RPC_URL", status: "invalid" });
  });

  it("accepts an exact Testnet CCTP configuration without requiring an unused Circle secret", () => {
    const environment = validCctpEnvironment();
    const results = checkEnvironment(environment, "cctp");
    expect(results.every((result) => result.status === "ready")).toBe(true);
    expect(results.some((result) => result.key === "CIRCLE_API_KEY")).toBe(false);
  });

  it("rejects Mainnet, altered domains, malformed contracts and insecure Stellar RPC", () => {
    const environment = validCctpEnvironment();
    environment.CIRCLE_ENV = "mainnet";
    environment.CCTP_BASE_DOMAIN = "0";
    environment.CCTP_STELLAR_DOMAIN = "99";
    environment.CCTP_STELLAR_FORWARDER = "not-a-contract";
    environment.STELLAR_RPC_URL = "http://soroban.example.test";

    expect(checkEnvironment(environment, "cctp")).toEqual(expect.arrayContaining([
      { key: "CIRCLE_ENV", status: "invalid" },
      { key: "CCTP_BASE_DOMAIN", status: "invalid" },
      { key: "CCTP_STELLAR_DOMAIN", status: "invalid" },
      { key: "CCTP_STELLAR_FORWARDER", status: "invalid" },
      { key: "STELLAR_RPC_URL", status: "invalid" },
    ]));
  });

  it("includes all CCTP requirements in the full product preflight", () => {
    const environment = validCctpEnvironment();
    const results = checkEnvironment(environment, "full");
    for (const key of [
      "CIRCLE_ENV",
      "CCTP_BASE_DOMAIN",
      "CCTP_STELLAR_DOMAIN",
      "CCTP_STELLAR_TOKEN_MESSENGER",
      "CCTP_STELLAR_MESSAGE_TRANSMITTER",
      "CCTP_STELLAR_FORWARDER",
      "BASE_SEPOLIA_RPC_URL",
    ]) {
      expect(results).toContainEqual({ key, status: "ready" });
    }
  });
});
