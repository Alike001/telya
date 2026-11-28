import { authenticatedFetch } from "./authenticated-fetch";

export const STELLAR_DEPLOYMENT_RELAYER_PATH = "/api/stellar/relayer/deployment" as const;

export type StellarDeploymentAuthorization = {
  readonly relayerUrl: typeof STELLAR_DEPLOYMENT_RELAYER_PATH;
  readonly expiresAt: string;
};

export function parseStellarDeploymentAuthorization(
  value: unknown,
  now = Date.now(),
): StellarDeploymentAuthorization | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (payload.relayerUrl !== STELLAR_DEPLOYMENT_RELAYER_PATH ||
      typeof payload.expiresAt !== "string") return null;
  const expiresAt = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  return { relayerUrl: STELLAR_DEPLOYMENT_RELAYER_PATH, expiresAt: payload.expiresAt };
}

export async function authorizeStellarDeployment(
  getAccessToken: () => Promise<string | null>,
  request = authenticatedFetch,
): Promise<StellarDeploymentAuthorization> {
  const response = await request(
    "/api/wallets/stellar/deployment/authorize",
    { method: "POST" },
    getAccessToken,
  );
  const payload: unknown = await response.json();
  const authorization = response.ok
    ? parseStellarDeploymentAuthorization(payload)
    : null;
  if (!authorization) {
    throw new Error("Authenticated Stellar account deployment is unavailable.");
  }
  return authorization;
}
