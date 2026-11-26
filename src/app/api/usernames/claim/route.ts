import { NextResponse } from "next/server";
import { getSqlClient } from "../../../../../server/db/client";
import { validateUsername } from "../../../../domain/username";

export const dynamic = "force-dynamic";

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof (error as Record<string, unknown>).code === "string"
    ? ((error as Record<string, unknown>).code as string)
    : undefined;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const { username, smartAccountAddress } = (body ?? {}) as {
    username?: string;
    smartAccountAddress?: string;
  };

  const validation = validateUsername(username ?? "");
  if (!validation.valid) {
    return NextResponse.json(
      { success: false, error: validation.error },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  if (!smartAccountAddress || typeof smartAccountAddress !== "string") {
    return NextResponse.json(
      { success: false, error: "Stellar smart account address is required." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  // Fail closed if database is unavailable
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        success: false,
        error: "Username claim registry is temporarily unavailable.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const normalizedSmartAccount = smartAccountAddress.trim();
  const did = `did:privy:stellar:${normalizedSmartAccount}`;

  try {
    const sql = getSqlClient();

    // 1. Ensure user row exists for this verified smart account
    const userRows = await sql`
      INSERT INTO users (privy_did)
      VALUES (${did})
      ON CONFLICT (privy_did) DO UPDATE SET updated_at = now()
      RETURNING id
    `;

    const userId = userRows[0]?.id;
    if (!userId) {
      throw new Error("Failed to record authenticated user account.");
    }

    // 2. Ensure wallet record is bound and verified
    await sql`
      INSERT INTO wallets (
        user_id,
        network,
        address,
        normalized_address,
        verification_status,
        verified_at
      ) VALUES (
        ${userId}::uuid,
        'stellar',
        ${normalizedSmartAccount},
        ${normalizedSmartAccount},
        'verified',
        now()
      )
      ON CONFLICT (network, normalized_address) DO UPDATE
      SET verification_status = 'verified',
          verified_at = COALESCE(wallets.verified_at, now())
    `;

    // 3. Atomically claim username in username_registry
    const claimRows = await sql`
      SELECT claim_username(${userId}::uuid, ${validation.display}) AS username_normalized
    `;

    const claimed = claimRows[0]?.username_normalized;
    return NextResponse.json(
      {
        success: true,
        username: claimed,
        display: `@${claimed}`,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const code = databaseErrorCode(error);
    // 23505 = unique_violation: username already taken by another user
    if (code === "23505") {
      return NextResponse.json(
        {
          success: false,
          error: `@${validation.normalized} was just claimed by another user.`,
        },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to persist username claim to registry. Please retry.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
