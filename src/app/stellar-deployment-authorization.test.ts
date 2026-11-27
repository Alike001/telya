import { describe, expect, it, vi } from "vitest";

import {
  authorizeStellarDeployment,
  parseStellarDeploymentAuthorization,
} from "./stellar-deployment-authorization";

describe("Stellar deployment browser authorization", () => {
  it("accepts only the protected, unexpired relayer handoff", () => {
    expect(parseStellarDeploymentAuthorization({
      relayerUrl: "/api/stellar/relayer/deployment",
      expiresAt: "2026-11-27T05:00:00.000Z",
    }, Date.parse("2026-11-27T04:00:00.000Z"))).toEqual({
      relayerUrl: "/api/stellar/relayer/deployment",
      expiresAt: "2026-11-27T05:00:00.000Z",
    });
    expect(parseStellarDeploymentAuthorization({
      relayerUrl: "/api/stellar/relayer",
      expiresAt: "2026-11-27T05:00:00.000Z",
    }, Date.parse("2026-11-27T04:00:00.000Z"))).toBeNull();
    expect(parseStellarDeploymentAuthorization({
      relayerUrl: "/api/stellar/relayer/deployment",
      expiresAt: "2026-11-27T03:00:00.000Z",
    }, Date.parse("2026-11-27T04:00:00.000Z"))).toBeNull();
  });

  it("requests authorization with the Privy token helper and exposes no raw handoff token", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({
      relayerUrl: "/api/stellar/relayer/deployment",
      expiresAt: "2099-11-27T05:00:00.000Z",
    }));
    const getAccessToken = vi.fn();
    const result = await authorizeStellarDeployment(getAccessToken, request);
    expect(request).toHaveBeenCalledWith(
      "/api/wallets/stellar/deployment/authorize",
      { method: "POST" },
      getAccessToken,
    );
    expect(result).toEqual({
      relayerUrl: "/api/stellar/relayer/deployment",
      expiresAt: "2099-11-27T05:00:00.000Z",
    });
    expect(result).not.toHaveProperty("token");
  });
});
