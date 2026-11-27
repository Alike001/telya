export interface SessionRequestGuard {
  readonly isActive: () => boolean;
  readonly cancel: () => void;
}

/** Prevent an async response from writing state after its auth session changed. */
export function createSessionRequestGuard(): SessionRequestGuard {
  let active = true;
  return {
    isActive: () => active,
    cancel: () => { active = false; },
  };
}

/** Capture one token provider for a multi-step operation in one auth epoch. */
export async function captureSessionAccessToken(
  getAccessToken: () => Promise<string | null>,
  guard: SessionRequestGuard,
): Promise<() => Promise<string>> {
  if (!guard.isActive()) throw new Error("Authenticated session changed");
  const token = await getAccessToken();
  if (!guard.isActive()) throw new Error("Authenticated session changed");
  if (!token) throw new Error("Sign-in token is unavailable");
  return async () => token;
}
