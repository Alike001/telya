import { randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";

import { neonConfig } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  recordBaseCctpSourceVerificationFailure,
  recordBaseDirectVerificationFailure,
  recordStellarToBaseDestinationVerificationFailure,
} from "./base-cctp";

function useIpv4NeonFetch(): void {
  neonConfig.fetchFunction = (url: string, options?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: options?.method,
      headers: options?.headers as Record<string, string>,
      family: 4,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode ?? 502,
        headers: response.headers as HeadersInit,
      })));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end(options?.body as string);
  });
}

describe("Base verification failure SQL on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "parses every guarded failure transition without writing for an unknown payment",
    async () => {
      useIpv4NeonFetch();
      const transactionHash = `0x${"a".repeat(64)}`;
      const cases = [
        recordBaseDirectVerificationFailure,
        recordBaseCctpSourceVerificationFailure,
        recordStellarToBaseDestinationVerificationFailure,
      ] as const;

      for (const recordFailure of cases) {
        await expect(recordFailure({
          paymentId: randomUUID(),
          transactionHash,
          reason: "integration SQL parse check",
        })).rejects.toThrow("changed while");
      }
    },
    30_000,
  );
});
