import type { ConnectedSmartAccount } from "../stellar/smart-account";

export type AuthenticatedAccountRequest = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

/** Accept only the authenticated, owner-scoped identity lookup response. */
export function parseOwnedStellarIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return payload.found === true &&
    typeof payload.username === "string" &&
    payload.username.trim().length > 0;
}

/** Fail closed unless the current session owns this exact verified account. */
export async function verifyRestoredAccountOwnership(
  account: ConnectedSmartAccount,
  request: AuthenticatedAccountRequest,
): Promise<boolean> {
  try {
    const response = await request(
      `/api/usernames/lookup?account=${encodeURIComponent(account.contractId)}`,
      { cache: "no-store" },
    );
    return response.ok && parseOwnedStellarIdentity(await response.json());
  } catch {
    return false;
  }
}
