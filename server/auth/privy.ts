import { InvalidAuthTokenError, PrivyClient } from "@privy-io/node";
import type { VerifyAccessTokenResponse } from "@privy-io/node";
import { getSqlClient } from "../db/client.ts";

export type AuthenticatedUser = {
  id: string;
  privyUserId: string;
  sessionId: string;
  expiresAt: Date;
};

export class AuthenticationError extends Error {
  readonly statusCode = 401;

  constructor(message = "Authentication is required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthenticationUnavailableError extends Error {
  readonly statusCode = 503;

  constructor() {
    super("Authentication provider is temporarily unavailable");
    this.name = "AuthenticationUnavailableError";
  }
}

let privyClient: PrivyClient | undefined;

function getPrivyClient(): PrivyClient {
  if (privyClient) return privyClient;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Privy server authentication is not configured");
  }

  privyClient = new PrivyClient({ appId, appSecret });
  return privyClient;
}

function isVerifiedClaims(value: VerifyAccessTokenResponse): boolean {
  return Boolean(
    value.user_id &&
      value.session_id &&
      value.app_id === process.env.NEXT_PUBLIC_PRIVY_APP_ID &&
      value.issuer === "privy.io" &&
      Number.isSafeInteger(value.issued_at) &&
      Number.isSafeInteger(value.expiration) &&
      value.expiration > Math.floor(Date.now() / 1000),
  );
}

async function verifyAccessToken(token: string): Promise<VerifyAccessTokenResponse> {
  try {
    const client = getPrivyClient();
    const claims = await client.utils().auth().verifyAccessToken(token);
    if (!isVerifiedClaims(claims)) throw new AuthenticationError("Invalid session");
    return claims;
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    if (error instanceof InvalidAuthTokenError) {
      throw new AuthenticationError("Invalid or expired session");
    }
    // Keep provider/network failures distinct from rejected credentials.
    throw new AuthenticationUnavailableError();
  }
}

function readBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match?.[1]) throw new AuthenticationError();
  return match[1];
}

async function persistVerifiedSession(
  claims: VerifyAccessTokenResponse,
): Promise<AuthenticatedUser> {
  const verifiedAt = new Date();
  const expiresAt = new Date(claims.expiration * 1000);

  // A single statement creates the app user and records the verified session.
  // A revoked session or a session ID attached to another user returns no row.
  let rows;
  try {
    const sql = getSqlClient();
    rows = await sql`
    WITH app_user AS (
      INSERT INTO users (privy_did)
      VALUES (${claims.user_id})
      ON CONFLICT (privy_did) DO UPDATE SET updated_at = now()
      RETURNING id, privy_did
    ), verified_session AS (
      INSERT INTO auth_sessions (privy_session_id, user_id, verified_at, expires_at)
      SELECT ${claims.session_id}, app_user.id, ${verifiedAt}, ${expiresAt}
      FROM app_user
      ON CONFLICT (privy_session_id) DO UPDATE
      SET verified_at = GREATEST(auth_sessions.verified_at, EXCLUDED.verified_at),
          expires_at = GREATEST(auth_sessions.expires_at, EXCLUDED.expires_at)
      WHERE auth_sessions.user_id = EXCLUDED.user_id
        AND auth_sessions.revoked_at IS NULL
      RETURNING user_id
    )
    SELECT app_user.id, app_user.privy_did
    FROM app_user
    JOIN verified_session ON verified_session.user_id = app_user.id
    `;
  } catch {
    throw new AuthenticationUnavailableError();
  }

  const row = rows[0];
  if (!row) throw new AuthenticationError("Session is no longer active");

  return {
    id: String(row.id),
    privyUserId: String(row.privy_did),
    sessionId: claims.session_id,
    expiresAt,
  };
}

/** Verify the bearer token with Privy, then resolve its server-side app session. */
export async function authenticateRequest(request: Request): Promise<AuthenticatedUser> {
  const claims = await verifyAccessToken(readBearerToken(request));
  return persistVerifiedSession(claims);
}
