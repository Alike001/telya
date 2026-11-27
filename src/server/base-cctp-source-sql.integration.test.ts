import { randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";

import { neonConfig } from "@neondatabase/serverless";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recordBaseCctpAttestation } from "./base-cctp";

describe("Base CCTP guarded source SQL on PostgreSQL", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "parses the atomic transition and rejects a nonexistent payment without events",
    async () => {
      // Node fetch times out for this workspace's Neon endpoint; HTTPS works.
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

      const paymentId = randomUUID();
      await expect(recordBaseCctpAttestation({
        paymentId,
        sourceTransactionHash: `0x${"a".repeat(64)}`,
        expectedRecipientAddress: "C".repeat(56),
        expectedRecipientAmount: "5",
        expectedAmountAtomic: "50000000",
        burnAmountAtomic: "5100000",
        maxFeeAtomic: "100000",
        circle: {
          status: "complete",
          sourceTransactionHash: `0x${"a".repeat(64)}`,
          message: `0x${"b".repeat(752)}`,
          attestation: `0x${"c".repeat(130)}`,
          messageHash: "d".repeat(64),
          attestationHash: "e".repeat(64),
        },
      })).rejects.toThrow("changed while source evidence was being recorded");
    },
    30_000,
  );
});
