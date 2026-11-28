import { describe, expect, it } from "vitest";

import { DOCK_TABS } from "./mobile-bottom-dock";

describe("mobile bottom dock", () => {
  it("links every tab to a section rendered by the integrated home page", () => {
    expect(DOCK_TABS.map(({ href }) => href)).toEqual([
      "#top",
      "#composer",
      "#agent-pass",
      "#activity",
    ]);
  });
});
