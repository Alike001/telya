import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import {
  authenticateRequest,
  AuthenticationError,
  AuthenticationUnavailableError,
} from "../../../../../server/auth/privy";
import {
  claimUsernameForVerifiedStellarWallet,
  StellarWalletNotVerifiedError,
  UsernameUnavailableError,
} from "../../../../../server/db/usernames";
import { validateUsername } from "../../../../domain/username";

export const dynamic = "force-dynamic";

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
    // A browser-supplied address never creates or upgrades a wallet record.
    const claimed = await claimUsernameForVerifiedStellarWallet(
      user,
      validation.display,
      normalizedSmartAccount,
    );
    return NextResponse.json(
      {
        success: true,
        username: claimed,
        display: `@${claimed}`,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof StellarWalletNotVerifiedError) {
      return NextResponse.json(
        { success: false, error: "This Stellar account is not verified for your sign-in." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    if (error instanceof UsernameUnavailableError) {
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
