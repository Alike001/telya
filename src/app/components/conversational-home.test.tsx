import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationalHome } from "./conversational-home";

describe("conversation financial boundary", () => {
  it("shows unavailable balances and no local payment success on first render", () => {
    const html = renderToStaticMarkup(<ConversationalHome />);
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain("Delivered");
    expect(html).not.toContain("submitted!");
  });
});
