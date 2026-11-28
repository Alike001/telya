import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactsDirectory } from "./contacts-directory";

describe("verified contact boundary", () => {
  it("does not substitute demo contacts or addresses for authenticated records", () => {
    const html = renderToStaticMarkup(<ContactsDirectory onSelectPayContact={() => {}} />);
    expect(html).toContain("Contacts unavailable");
    expect(html).not.toContain("Alice Vance");
    expect(html).not.toContain("Bob Martinez");
    expect(html).not.toContain("Save Contact");
    expect(html).not.toContain("Pay</span>");
  });
});
