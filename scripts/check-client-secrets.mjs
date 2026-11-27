import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SERVER_SECRET_KEYS = Object.freeze([
  "DATABASE_URL",
  "PRIVY_APP_SECRET",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "STELLAR_FEE_SPONSOR_SECRET",
  "CIRCLE_API_KEY",
  "MONEYGRAM_PUBLIC_KEY",
  "MONEYGRAM_SECRET_KEY",
]);

function filesBelow(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/** Scan emitted browser assets without ever returning or printing secret values. */
export function scanClientBundleSecrets({
  directory = ".next/static",
  environment = process.env,
} = {}) {
  const root = resolve(directory);
  if (!existsSync(root)) {
    throw new Error(`Client bundle ${directory} is missing. Run pnpm build first.`);
  }
  const files = filesBelow(root);
  const contents = files.map((path) => ({ path, bytes: readFileSync(path) }));
  const results = SERVER_SECRET_KEYS.map((key) => {
    const value = environment[key]?.trim() ?? "";
    if (!value) return { key, status: "not-configured", files: [] };
    const needle = Buffer.from(value);
    const matches = contents
      .filter(({ bytes }) => bytes.includes(needle))
      .map(({ path }) => relative(root, path));
    return {
      key,
      status: matches.length > 0 ? "leaked" : "absent",
      files: matches,
    };
  });
  return { filesScanned: files.length, results };
}

export function formatClientBundleSecretReport(scan) {
  const lines = [
    "Telya client-bundle secret scan (values hidden)",
    `SCANNED     ${scan.filesScanned} emitted browser files`,
  ];
  for (const result of scan.results) {
    if (result.status === "leaked") {
      lines.push(`LEAKED      ${result.key} (${result.files.join(", ")})`);
    } else if (result.status === "absent") {
      lines.push(`ABSENT      ${result.key}`);
    } else {
      lines.push(`NOT SET     ${result.key}`);
    }
  }
  const ready = scan.results.every((result) => result.status !== "leaked");
  lines.push(ready
    ? "READY       No configured server secret value was found in browser assets."
    : "NOT READY   Remove every reported server secret from the browser bundle.");
  return { ready, output: lines.join("\n") };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const report = formatClientBundleSecretReport(scanClientBundleSecrets());
    console.log(report.output);
    process.exitCode = report.ready ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Client secret scan failed.");
    process.exitCode = 2;
  }
}
