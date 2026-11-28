import type { PaymentReview } from "./conversation-payment";

export interface ChatMessage {
  readonly id: string;
  readonly sender: "user" | "telya";
  readonly text: string;
  readonly timestamp: string;
  readonly review?: PaymentReview;
  readonly recipientLabel?: string;
}

export interface ConversationSessionState {
  readonly messages: readonly ChatMessage[];
  readonly conversationId: null;
}

export const conversationWelcome: ChatMessage = {
  id: "welcome-1",
  sender: "telya",
  text: "Tell Telya who you want to pay and how much. A payment review appears only after the recipient, balance, route and fees are verified.",
  timestamp: "Just now",
};

/** Return a fresh, identity-neutral conversation with no persisted review. */
export function resetConversationSession(): ConversationSessionState {
  return { messages: [conversationWelcome], conversationId: null };
}
