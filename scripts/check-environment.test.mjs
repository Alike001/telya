import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
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
});
