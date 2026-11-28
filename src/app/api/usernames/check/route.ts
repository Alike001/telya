import { NextResponse } from "next/server";
import { getSqlClient } from "../../../../../server/db/client";
import { validateUsername } from "../../../../domain/username";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUsername = searchParams.get("username") ?? "";

  const validation = validateUsername(rawUsername);
  if (!validation.valid) {
    return NextResponse.json(
      {
        available: false,
        normalized: validation.normalized,
        error: validation.error,
      },
      {
        status: validation.error?.includes("reserved") ? 400 : 400,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  const { normalized, display } = validation;

  // Fail closed: database connection is mandatory for authoritative availability checks
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        available: false,
        normalized,
        error: "Username registry service is temporarily unavailable.",
      },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  try {
    const sql = getSqlClient();
    const rows = await sql`
      SELECT status FROM username_registry
      WHERE username_normalized = ${normalized}
      LIMIT 1
    `;

    if (rows.length > 0) {
      const status = rows[0]?.status;
      return NextResponse.json(
        {
          available: false,
          normalized,
          error:
            status === "reserved"
              ? `@${normalized} is a reserved system name.`
              : `@${normalized} is already taken.`,
        },
        {
          headers: { "cache-control": "no-store" },
        },
      );
    }

    return NextResponse.json(
      {
        available: true,
        normalized,
        display,
      },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch {
    // Fail closed: never guess or substitute mock data on database failure
    return NextResponse.json(
      {
        available: false,
        normalized,
        error: "Unable to verify username availability at this time. Please retry.",
      },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
