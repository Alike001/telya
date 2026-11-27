import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Networks, StrKey } from "@stellar/stellar-sdk";

const PLACEHOLDER = /^(?:\[?sensitive\]?|change-?me|replace-?me|your[_-].*|<.*>|example)$/i;

const COMMON_STELLAR_REQUIREMENTS = Object.freeze([
  "STELLAR_RPC_URL",
  "STELLAR_NETWORK_PASSPHRASE",
  "STELLAR_ACCOUNT_WASM_HASH",
  "STELLAR_WEBAUTHN_VERIFIER",
  "STELLAR_ED25519_VERIFIER",
  "STELLAR_SPENDING_LIMIT_POLICY",
  "STELLAR_USDC_SAC",
]);

const CCTP_REQUIREMENTS = Object.freeze([
  "CIRCLE_ENV",
  "CCTP_BASE_DOMAIN",
  "CCTP_STELLAR_DOMAIN",
  "CCTP_STELLAR_TOKEN_MESSENGER",
  "CCTP_STELLAR_MESSAGE_TRANSMITTER",
  "CCTP_STELLAR_FORWARDER",
  "BASE_SEPOLIA_RPC_URL",
]);

export const FLOW_REQUIREMENTS = Object.freeze({
  onboarding: [
    "DATABASE_URL",
    "NEXT_PUBLIC_PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "STELLAR_FEE_SPONSOR_SECRET",
    "STELLAR_WEBAUTHN_ALLOWED_ORIGINS",
    "STELLAR_WEBAUTHN_RP_ID",
    ...COMMON_STELLAR_REQUIREMENTS,
  ],
  stellar: [
    "DATABASE_URL",
    "NEXT_PUBLIC_PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "STELLAR_FEE_SPONSOR_SECRET",
    "STELLAR_WEBAUTHN_ALLOWED_ORIGINS",
    "STELLAR_WEBAUTHN_RP_ID",
    ...COMMON_STELLAR_REQUIREMENTS,
  ],
  base: [
    "DATABASE_URL",
    "NEXT_PUBLIC_PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "BASE_SEPOLIA_RPC_URL",
  ],
  cctp: [
    "DATABASE_URL",
    "NEXT_PUBLIC_PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "STELLAR_FEE_SPONSOR_SECRET",
    "STELLAR_WEBAUTHN_ALLOWED_ORIGINS",
    "STELLAR_WEBAUTHN_RP_ID",
    ...COMMON_STELLAR_REQUIREMENTS,
    ...CCTP_REQUIREMENTS,
  ],
  full: [
    "DATABASE_URL",
    "NEXT_PUBLIC_PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "STELLAR_FEE_SPONSOR_SECRET",
    "STELLAR_WEBAUTHN_ALLOWED_ORIGINS",
    "STELLAR_WEBAUTHN_RP_ID",
    ...COMMON_STELLAR_REQUIREMENTS,
    ...CCTP_REQUIREMENTS,
  ],
});

export function parseEnvironmentFile(contents) {
  const parsed = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function isPlaceholder(value) {
  const normalized = value.trim();
  return !normalized || PLACEHOLDER.test(normalized);
}

function isDatabaseUrl(value) {
  try {
    return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isCredentialFreeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hasValidWebAuthnOrigins(value) {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) return false;
  return origins.every((origin) => {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
    } catch {
      return false;
    }
  });
}

function isValidRpId(value) {
  const rpId = value.trim();
  return Boolean(rpId) && !rpId.includes(":") && !rpId.includes("/") && !/\s/.test(rpId);
}

function isContractAddress(value) {
  return StrKey.isValidContract(value);
}

function isHex32(value) {
  return /^[0-9a-f]{64}$/i.test(value);
}

function validShape(key, value) {
  switch (key) {
    case "DATABASE_URL":
      return isDatabaseUrl(value);
    case "STELLAR_FEE_SPONSOR_SECRET":
      return StrKey.isValidEd25519SecretSeed(value);
    case "STELLAR_RPC_URL":
    case "BASE_SEPOLIA_RPC_URL":
      return isCredentialFreeHttpsUrl(value);
    case "STELLAR_NETWORK_PASSPHRASE":
      return value === Networks.TESTNET;
    case "STELLAR_ACCOUNT_WASM_HASH":
      return isHex32(value);
    case "STELLAR_WEBAUTHN_VERIFIER":
    case "STELLAR_ED25519_VERIFIER":
    case "STELLAR_SPENDING_LIMIT_POLICY":
    case "STELLAR_USDC_SAC":
    case "CCTP_STELLAR_TOKEN_MESSENGER":
    case "CCTP_STELLAR_MESSAGE_TRANSMITTER":
    case "CCTP_STELLAR_FORWARDER":
      return isContractAddress(value);
    case "STELLAR_WEBAUTHN_ALLOWED_ORIGINS":
      return hasValidWebAuthnOrigins(value);
    case "STELLAR_WEBAUTHN_RP_ID":
      return isValidRpId(value);
    case "CIRCLE_ENV":
      return value === "testnet";
    case "CCTP_BASE_DOMAIN":
      return value === "6";
    case "CCTP_STELLAR_DOMAIN":
      return value === "27";
    default:
      return true;
  }
}

export function checkEnvironment(environment, flow = "onboarding") {
  const requirements = FLOW_REQUIREMENTS[flow];
  if (!requirements) {
    throw new Error(`Unknown flow ${JSON.stringify(flow)}. Choose ${Object.keys(FLOW_REQUIREMENTS).join(", ")}.`);
  }

  return requirements.map((key) => {
    const value = environment[key] ?? "";
    if (isPlaceholder(value)) return { key, status: value.trim() ? "placeholder" : "missing" };
    if (!validShape(key, value.trim())) return { key, status: "invalid" };
    return { key, status: "ready" };
  });
}

export function formatReport(results, flow) {
  const lines = [`Telya ${flow} environment preflight (values hidden)`];
  for (const result of results) lines.push(`${result.status.toUpperCase().padEnd(11)} ${result.key}`);
  const ready = results.every((result) => result.status === "ready");
  lines.push(ready ? "READY       Required configuration is present." : "NOT READY   Fix the entries above; no values were printed.");
  return { ready, output: lines.join("\n") };
}

function loadEnvironment(path = ".env.local") {
  const fileEnvironment = existsSync(path) ? parseEnvironmentFile(readFileSync(path, "utf8")) : {};
  return { ...fileEnvironment, ...process.env };
}

function selectedFlow(argv) {
  const argument = argv.find((value) => value.startsWith("--flow="));
  return argument?.slice("--flow=".length) || "onboarding";
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const flow = selectedFlow(process.argv.slice(2));
    const report = formatReport(checkEnvironment(loadEnvironment(), flow), flow);
    console.log(report.output);
    process.exitCode = report.ready ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Environment preflight failed.");
    process.exitCode = 2;
  }
}
