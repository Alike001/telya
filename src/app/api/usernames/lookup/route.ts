import { NextResponse } from "next/server";
import { getSqlClient } from "../../../../../server/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const account = searchParams.get("account")?.trim() ?? "";

  if (!account) {
    return NextResponse.json(
      { found: false, error: "Account address is required." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  // Fail closed if database is unavailable
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        found: false,
        error: "Username registry lookup is temporarily unavailable.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const sql = getSqlClient();
    const rows = await sql`
      SELECT ur.username_normalized, ur.username_display
      FROM wallets w
      JOIN username_registry ur ON ur.user_id = w.user_id AND ur.status = 'active'
      WHERE w.network = 'stellar'
        AND w.normalized_address = ${account}
        AND w.verification_status = 'verified'
      LIMIT 1
    `;

    if (rows.length === 0 || !rows[0]?.username_normalized) {
      return NextResponse.json(
        { found: false },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        found: true,
        username: rows[0].username_normalized,
        display: rows[0].username_display ?? `@${rows[0].username_normalized}`,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        found: false,
        error: "Failed to lookup account identity. Please retry.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
