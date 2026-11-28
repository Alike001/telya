import { describe, expect, it } from "vitest";

import { resetConversationSession } from "./conversation-session.ts";

describe("conversation session isolation", () => {
  it("starts a new identity with no prior conversation or payment review", () => {
    const reset = resetConversationSession();
    expect(reset.conversationId).toBeNull();
    expect(reset.messages).toHaveLength(1);
    expect(reset.messages[0]).toMatchObject({ sender: "telya", id: "welcome-1" });
    expect(reset.messages[0]).not.toHaveProperty("review");
    expect(reset.messages[0]).not.toHaveProperty("recipientLabel");
  });

  it("returns a new message array for each browser identity", () => {
    expect(resetConversationSession().messages).not.toBe(resetConversationSession().messages);
  });
});
