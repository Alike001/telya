import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatClientBundleSecretReport,
  scanClientBundleSecrets,
} from "./check-client-secrets.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function bundleWith(contents) {
  const directory = mkdtempSync(join(tmpdir(), "telya-client-bundle-"));
  temporaryDirectories.push(directory);
  const chunks = join(directory, "chunks");
  mkdirSync(chunks);
  writeFileSync(join(chunks, "app.js"), contents);
  return directory;
}

describe("client-bundle secret scan", () => {
  it("fails closed on a configured secret without echoing the value", () => {
    const secret = "postgresql://private-user:private-password@example.invalid/telya";
    const scan = scanClientBundleSecrets({
      directory: bundleWith(`window.__bad=${JSON.stringify(secret)}`),
      environment: { DATABASE_URL: secret },
    });
    const report = formatClientBundleSecretReport(scan);

    expect(report.ready).toBe(false);
    expect(report.output).toContain("LEAKED      DATABASE_URL");
    expect(report.output).not.toContain(secret);
  });

  it("passes configured values that are absent and labels unset keys", () => {
    const scan = scanClientBundleSecrets({
      directory: bundleWith("console.log('public client bundle')"),
      environment: { PRIVY_APP_SECRET: "server-only-privy-secret" },
    });
    const report = formatClientBundleSecretReport(scan);

    expect(report.ready).toBe(true);
    expect(report.output).toContain("ABSENT      PRIVY_APP_SECRET");
    expect(report.output).toContain("NOT SET     DATABASE_URL");
    expect(report.output).not.toContain("server-only-privy-secret");
  });
});
