import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { validateUsername, RESERVED_USERNAMES } from "./username";
import { GET as checkUsernameRoute } from "../app/api/usernames/check/route";
import { POST as claimUsernameRoute } from "../app/api/usernames/claim/route";
import { GET as lookupUsernameRoute } from "../app/api/usernames/lookup/route";
import * as dbClient from "../../server/db/client";
import * as auth from "../../server/auth/privy";

const TEST_ACCOUNT = "CD4TKTI6AOYCMVE5U2G6HQNWPLAP36ND3SXM4OLQMTD47AR6CL2C62YM";

describe("Production Username Validator", () => {
  it("normalizes case so Alice, alice, and ALICE resolve identically", () => {
    const r1 = validateUsername("Alice");
    const r2 = validateUsername("alice");
    const r3 = validateUsername("ALICE");

    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(true);
    expect(r3.valid).toBe(true);
    expect(r1.normalized).toBe("alice");
    expect(r2.normalized).toBe("alice");
    expect(r3.normalized).toBe("alice");
  });

  it("strips leading @ prefix gracefully", () => {
    const res = validateUsername("@alex_99");
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("alex_99");
    expect(res.display).toBe("@alex_99");
  });

  it("rejects all reserved system handles", () => {
    for (const reserved of RESERVED_USERNAMES) {
      const res = validateUsername(reserved);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("reserved");
    }
  });

  it("rejects invalid characters and boundary lengths", () => {
    expect(validateUsername("").valid).toBe(false);
    expect(validateUsername("  ").valid).toBe(false);
    expect(validateUsername("ab").valid).toBe(false);
    expect(validateUsername("a".repeat(31)).valid).toBe(false);
    expect(validateUsername("alice.eth").valid).toBe(false);
    expect(validateUsername("alice-bob").valid).toBe(false);
    expect(validateUsername("alice@telya").valid).toBe(false);
    expect(validateUsername("alice space").valid).toBe(false);
  });

  it("accepts valid alphanumeric and underscored handles", () => {
    expect(validateUsername("alice_dev").valid).toBe(true);
    expect(validateUsername("bob123").valid).toBe(true);
    expect(validateUsername("user_99").valid).toBe(true);
    expect(validateUsername("a_b_c_123").valid).toBe(true);
  });
});

describe("Username Availability Route (/api/usernames/check) - Fail Closed", () => {
  const originalEnv = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it("fails closed with 503 when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    const request = new Request("http://localhost:3000/api/usernames/check?username=prudent");
    const response = await checkUsernameRoute(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.available).toBe(false);
    expect(body.error).toContain("temporarily unavailable");
  });

  it("fails closed with 503 when the database query throws", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";
    vi.spyOn(dbClient, "getSqlClient").mockImplementation(() => {
      throw new Error("Neon connection timed out");
    });

    const request = new Request("http://localhost:3000/api/usernames/check?username=prudent");
    const response = await checkUsernameRoute(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.available).toBe(false);
    expect(body.error).toContain("Unable to verify username availability");
  });

  it("rejects reserved system names with 400 before querying database", async () => {
    const request = new Request("http://localhost:3000/api/usernames/check?username=admin");
    const response = await checkUsernameRoute(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.available).toBe(false);
    expect(body.error).toContain("reserved");
  });

  it("rejects invalid format with 400 before querying database", async () => {
    const request = new Request("http://localhost:3000/api/usernames/check?username=ab");
    const response = await checkUsernameRoute(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.available).toBe(false);
  });

  it("returns available=false when username is already in registry", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";
    const mockSql: any = vi.fn().mockResolvedValue([{ status: "active" }]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(mockSql);

    const request = new Request("http://localhost:3000/api/usernames/check?username=Alice");
    const response = await checkUsernameRoute(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.error).toContain("@alice is already taken");
  });

  it("returns available=true when username is free", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";
    const mockSql: any = vi.fn().mockResolvedValue([]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(mockSql);

    const request = new Request("http://localhost:3000/api/usernames/check?username=brand_new_user");
    const response = await checkUsernameRoute(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.normalized).toBe("brand_new_user");
  });
});

describe("Atomic Username Claim Route (/api/usernames/claim)", () => {
  const originalEnv = process.env.DATABASE_URL;

  function request(username = "Prudent", smartAccountAddress = TEST_ACCOUNT) {
    return new Request("http://localhost:3000/api/usernames/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, smartAccountAddress }),
    });
  }

  function authenticated() {
    vi.spyOn(auth, "authenticateRequest").mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001",
      privyUserId: "did:privy:real-user",
      sessionId: "verified-session",
      expiresAt: new Date(Date.now() + 60_000),
    });
  }

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it("fails closed with 503 when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    const response = await claimUsernameRoute(request());
    expect(response.status).toBe(503);
  });

  it("rejects unauthorized / missing smart account address with 400", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";

    const response = await claimUsernameRoute(request("prudent", ""));
    expect(response.status).toBe(400);
  });

  it("rejects a missing or invalid session before changing the registry", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";
    const sql = vi.fn();
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);
    vi.spyOn(auth, "authenticateRequest").mockRejectedValue(new auth.AuthenticationError());

    const response = await claimUsernameRoute(request());
    expect(response.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });

  it("does not claim a name when the wallet is not verified for the session user", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";
    authenticated();
    const sql = vi.fn().mockResolvedValue([]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);

    const response = await claimUsernameRoute(request());
    expect(response.status).toBe(403);
    expect(sql).toHaveBeenCalledTimes(1);
    const query = sql.mock.calls[0]?.[0]?.join(" ") ?? "";
    expect(query).toContain("verification_status = 'verified'");
    expect(query).toContain("user_id = ");
    expect(query).not.toContain("INSERT INTO wallets");
  });

  it("rejects concurrent / duplicate claim race with 409 conflict", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";

    const errorWithCode = new Error("Unique constraint violation");
    (errorWithCode as any).code = "23505";

    authenticated();
    const mockSql: any = vi.fn().mockRejectedValue(errorWithCode);

    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(mockSql);

    const response = await claimUsernameRoute(request("concurrent_alex"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error).toContain("was just claimed by another user");
  });

  it("persists atomic claim and returns claimed handle", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";

    authenticated();
    const mockSql: any = vi.fn().mockResolvedValue([{ username_normalized: "prudent" }]);

    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(mockSql);

    const response = await claimUsernameRoute(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.username).toBe("prudent");
  });
});

describe("Username Server Lookup Route (/api/usernames/lookup)", () => {
  const originalEnv = process.env.DATABASE_URL;

  function authenticated() {
    vi.spyOn(auth, "authenticateRequest").mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000001",
      privyUserId: "did:privy:real-user",
      sessionId: "verified-session",
      expiresAt: new Date(Date.now() + 60_000),
    });
  }

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it("fails closed with 503 when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    const request = new Request("http://localhost:3000/api/usernames/lookup?account=CBXYZ");
    const response = await lookupUsernameRoute(request);
    expect(response.status).toBe(503);
  });

  it("returns found=false when account has no claimed username", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";
    authenticated();
    const mockSql: any = vi.fn().mockResolvedValue([]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(mockSql);

    const request = new Request("http://localhost:3000/api/usernames/lookup?account=CBXYZ");
    const response = await lookupUsernameRoute(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.found).toBe(false);
  });

  it("restores durable claimed username when account exists on server", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";
    authenticated();
    const mockSql: any = vi.fn().mockResolvedValue([{
      username_normalized: "prudent",
      username_display: "@prudent",
    }]);
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(mockSql);

    const request = new Request("http://localhost:3000/api/usernames/lookup?account=CBXYZ");
    const response = await lookupUsernameRoute(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.found).toBe(true);
    expect(body.username).toBe("prudent");
    const query = mockSql.mock.calls[0]?.[0]?.join(" ") ?? "";
    expect(query).toContain("w.user_id = ");
    expect(query).toContain("verification_status = 'verified'");
  });

  it("does not reveal an account identity without a verified session", async () => {
    process.env.DATABASE_URL = "postgres://fake:5432/db";
    const sql = vi.fn();
    vi.spyOn(dbClient, "getSqlClient").mockReturnValue(sql as any);
    vi.spyOn(auth, "authenticateRequest").mockRejectedValue(new auth.AuthenticationError());

    const request = new Request("http://localhost:3000/api/usernames/lookup?account=CBXYZ");
    const response = await lookupUsernameRoute(request);
    expect(response.status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
  });
});
