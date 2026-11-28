import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JudgeTestnetDrawer } from "./judge-testnet-drawer";

describe("judge guide readiness", () => {
  it("shows a live health link without marking unverified routes ready", () => {
    const html = renderToStaticMarkup(<JudgeTestnetDrawer isOpen onClose={() => {}} onQuickPrompt={() => {}} />);
    expect(html).toContain("/api/health");
    expect(html).toContain("must be verified separately");
    expect(html).not.toContain("status-dot green");
    expect(html).not.toContain("@alice");
  });
});
