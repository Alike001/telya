import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import {
  authenticateRequest,
  AuthenticationError,
  AuthenticationUnavailableError,
} from "../../../../../server/auth/privy";
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

  if (typeof smartAccountAddress !== "string" ||
      !StrKey.isValidContract(smartAccountAddress.trim())) {
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

  let user;
  try {
    user = await authenticateRequest(request);
  } catch (error) {
    const unavailable = error instanceof AuthenticationUnavailableError ||
      !(error instanceof AuthenticationError);
    return NextResponse.json(
      { success: false, error: unavailable
        ? "Authentication is temporarily unavailable."
        : "Sign in before claiming a username." },
      { status: unavailable ? 503 : 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const sql = getSqlClient();

    // The wallet must have been verified and bound to this authenticated user
    // by a separate proof-of-control flow. A browser-supplied address never
    // creates or upgrades a wallet record here.
    const claimRows = await sql`
      WITH owned_wallet AS MATERIALIZED (
        SELECT id FROM wallets
        WHERE user_id = ${user.id}::uuid
          AND network = 'stellar'
          AND normalized_address = ${normalizedSmartAccount}
          AND verification_status = 'verified'
        FOR UPDATE
      )
      SELECT claim_username(${user.id}::uuid, ${validation.display}) AS username_normalized
      FROM owned_wallet
    `;

    const claimed = claimRows[0]?.username_normalized;
    if (typeof claimed !== "string") {
      return NextResponse.json(
        { success: false, error: "This Stellar account is not verified for your sign-in." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
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
