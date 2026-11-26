import { afterEach, describe, expect, it, vi } from "vitest";
import * as dbClient from "../db/client.ts";
import { createPaymentHandler } from "../api/payments.ts";
import { listPayments } from "./service.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const FIRST_ID = "00000000-0000-0000-0000-000000000011";
const SECOND_ID = "00000000-0000-0000-0000-000000000012";
const THIRD_ID = "00000000-0000-0000-0000-000000000013";
const user = {
  id: USER_ID,
  privyUserId: "did:privy:verified",
  sessionId: "verified-session",
  expiresAt: new Date(Date.now() + 60_000),
};

function row(id: string, status = "awaiting_confirmation") {
  return {
    id,
    status,
    route_id: "stellar_to_stellar",
    source_network: "stellar",
    destination_network: "stellar",
    rail: "stellar_direct",
    recipient_address: "CC5CEYCUE7KZS3VA7ICX7H5GFKW7KYN4QEO2HDDW2GSW4YWZK7JSWKW3",
    expected_recipient_amount: "1.25",
    verified_recipient_address: null,
    verified_recipient_amount: null,
    source_transaction_hash: null,
    destination_transaction_hash: null,
    failure_code: null,
    fees: [],
    created_at: "2026-11-26T12:00:00Z",
    updated_at: "2026-11-26T12:00:00Z",
    internal_debug: "must-not-reach-client",
    user_id: USER_ID,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("owned payment activity", () => {
  it("uses an owner-bound cursor and returns a stable next page ID", async () => {
    const sql = vi.fn().mockResolvedValue([row(FIRST_ID), row(SECOND_ID), row(THIRD_ID)]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);

    const page = await listPayments(user, { beforeId: FIRST_ID, limit: 2 });
    expect(page.items.map((item) => item.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(page.nextCursor).toBe(SECOND_ID);
    const query = sql.mock.calls[0]?.[0]?.join(" ") ?? "";
    expect(query).toContain("cursor_payment");
    expect(query).toContain("p.user_id = ");
    expect(query).toContain("ORDER BY p.created_at DESC, p.id DESC");
    expect(sql.mock.calls[0]?.slice(1)).toContain(USER_ID);
  });

  it("returns consumer-safe summaries without exposing internal fields", async () => {
    const sql = vi.fn().mockResolvedValue([row(FIRST_ID)]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);
    const handle = createPaymentHandler({ authenticate: async () => user });

    const response = await handle(new Request("http://localhost/api/payments?limit=2"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0].expectedRecipientAmount).toBe("1.25");
    expect(body.payments[0].verifiedRecipientAmount).toBeNull();
    expect(body.nextCursor).toBeNull();
    expect(JSON.stringify(body)).not.toContain("must-not-reach-client");
    expect(body.payments[0]).not.toHaveProperty("user_id");
  });

  it("rejects an invalid cursor before any database query", async () => {
    const sql = vi.fn();
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);
    const handle = createPaymentHandler({ authenticate: async () => user });

    const response = await handle(new Request("http://localhost/api/payments?before=not-a-payment-id"));
    expect(response.status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });
});
