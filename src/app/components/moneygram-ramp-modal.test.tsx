import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MoneyGramRampModal } from "./moneygram-ramp-modal";

describe("MoneyGram access boundary", () => {
  it("shows partner access pending without a fee, cashier reference or settlement claim", () => {
    const html = renderToStaticMarkup(<MoneyGramRampModal stellarAddress={null} onClose={() => {}} />);
    expect(html).toContain("Partner access pending");
    expect(html).toContain("unavailable");
    expect(html).not.toContain("Simulate Cashier Confirmation");
    expect(html).not.toContain("Digital Dollars Credited");
    expect(html).not.toContain("Settled &amp; Verified");
    expect(html).not.toContain("$1.50");
    expect(html).not.toContain("MG-");
  });
});
