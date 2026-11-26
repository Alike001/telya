import { randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";

import { neonConfig } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recordStellarCctpSource } from "./stellar-cctp";

describe("Stellar CCTP guarded source SQL on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "parses the atomic transition and rejects a nonexistent payment without events",
    async () => {
      // Keep the HTTPS transport workaround confined to this database test.
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

      await expect(recordStellarCctpSource({
        paymentId: randomUUID(),
        transactionHash: "a".repeat(64),
        sourceLedger: 12345,
        recipientAddress: `0x${"b".repeat(40)}`,
        expectedRecipientAmount: "5",
        expectedAmountAtomic: "50000000",
      })).rejects.toThrow("changed while source evidence was being recorded");
    },
    30_000,
  );
});
