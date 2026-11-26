import { readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../db/migrations/0008_base_cctp.sql", import.meta.url),
  "utf8",
);

describe("Base CCTP recipient address constraint", () => {
  it("compares Base EVM recipients case-insensitively and Stellar recipients exactly", () => {
    expect(migration).toMatch(
      /WHEN route_id IN \('base_to_base', 'stellar_to_base'\)\s+THEN lower\(verified_recipient_address\) = lower\(expected_recipient_address\)\s+ELSE verified_recipient_address = expected_recipient_address/s,
    );
  });

  it.skipIf(!process.env.DATABASE_URL)(
    "accepts a checksummed Base recipient and lowercase verified recipient under the applied PostgreSQL constraint",
    async () => {
      const sql = neon(process.env.DATABASE_URL!);
      const results = await sql.transaction([
        sql`CREATE TEMP TABLE base_cctp_recipient_case_probe
          (LIKE base_cctp_operations INCLUDING CONSTRAINTS) ON COMMIT DROP`,
        sql`
          INSERT INTO base_cctp_recipient_case_probe (
            payment_id, route_id, status, destination_transaction_hash,
            expected_recipient_address, expected_amount_atomic,
            verified_recipient_address, verified_amount_atomic, verified_at
          ) VALUES (
            '11111111-1111-4111-8111-111111111111'::uuid,
            'stellar_to_base', 'completed', ${`0x${"d".repeat(64)}`},
            '0xAbCdEf0123456789aBCdef0123456789abCDef01', 5000000,
            '0xabcdef0123456789abcdef0123456789abcdef01', 5000000, now()
          ) RETURNING payment_id
        `,
      ]);

      expect(results[1]).toHaveLength(1);
    },
  );
});
