import { describe, expect, it } from "vitest";

import {
  clearStellarPaymentSessionCookie,
  readStellarPaymentSessionCookie,
  stellarPaymentSessionCookie,
} from "./stellar-execution-session.ts";

describe("Stellar payment execution cookie", () => {
  it("reads only an exact 32-byte base64url token", () => {
    const token = "A".repeat(43);
    expect(readStellarPaymentSessionCookie(new Request("https://telya.test", {
      headers: { cookie: `other=x; __Secure-telya_stellar_payment=${token}; final=y` },
    }))).toBe(token);
    expect(readStellarPaymentSessionCookie(new Request("https://telya.test", {
      headers: { cookie: "__Secure-telya_stellar_payment=not-valid" },
    }))).toBeNull();
  });

  it("restricts and clears the HttpOnly cookie on the dedicated relayer path", () => {
    const issued = stellarPaymentSessionCookie("A".repeat(43));
    expect(issued).toContain("Path=/api/stellar/relayer/payment");
    expect(issued).toContain("Max-Age=300");
    expect(issued).toContain("HttpOnly");
    expect(issued).toContain("Secure");
    expect(issued).toContain("SameSite=Strict");
    expect(clearStellarPaymentSessionCookie()).toContain("Max-Age=0");
  });
});
