import { describe, expect, it } from "vitest";

import { parseSavedContact, parseVerifiedContacts } from "./contact-directory";

const contact = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Alice",
  username: "alice",
  preferredReceiveNetwork: "stellar",
  destinations: [{
    network: "stellar",
    address: `C${"A".repeat(55)}`,
    isVerified: true,
  }],
  createdAt: "2026-11-26T12:00:00.000Z",
  updatedAt: "2026-11-26T12:00:00.000Z",
};

describe("verified contact response parsing", () => {
  it("accepts authenticated contacts with verified destinations", () => {
    expect(parseVerifiedContacts({ contacts: [contact] })).toEqual([{
      ...contact,
      destinations: [{ network: "stellar", address: contact.destinations[0]!.address }],
    }]);
    expect(parseSavedContact({ contact })).toMatchObject({ username: "alice" });
  });

  it("keeps a saved contact without a verified wallet visibly non-payable", () => {
    expect(parseVerifiedContacts({ contacts: [{ ...contact, destinations: [] }] }))
      .toMatchObject([{ username: "alice", destinations: [] }]);
  });

  it("rejects browser-supplied or unverified destination claims", () => {
    expect(parseVerifiedContacts({
      contacts: [{ ...contact, destinations: [{ ...contact.destinations[0], isVerified: false }] }],
    })).toBeNull();
    expect(parseVerifiedContacts({
      contacts: [{ ...contact, destinations: [{ ...contact.destinations[0], address: "not-an-address" }] }],
    })).toBeNull();
  });
});
