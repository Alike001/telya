/** Send a Privy session to server-owned APIs without storing or logging the token. */
export async function authenticatedFetch(
  input: string,
  init: RequestInit,
  getAccessToken: () => Promise<string | null>,
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("Sign-in token is unavailable. Sign in and try again.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
