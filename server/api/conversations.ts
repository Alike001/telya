import { authenticateRequest } from "../auth/privy.ts";
import {
  appendUserMessage,
  ConversationInputError,
  ConversationNotFoundError,
  createConversation,
  listConversationMessages,
  listConversations,
} from "../conversations/service.ts";
import { createAuthenticatedHandler, isRecord, jsonResponse, readJson } from "./http.ts";
import type { AuthenticateRequest } from "./http.ts";

function boundedLimit(value: string | null, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  return Math.max(1, Math.min(Number(value), 200));
}

export function createConversationsHandler(options: { authenticate?: AuthenticateRequest } = {}) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      const url = new URL(request.url);
      if (request.method === "GET") {
        const conversationId = url.searchParams.get("id");
        if (conversationId) {
          const messages = await listConversationMessages(user, conversationId, boundedLimit(url.searchParams.get("limit"), 100));
          return jsonResponse({ messages });
        }
        const conversations = await listConversations(user, boundedLimit(url.searchParams.get("limit"), 50));
        return jsonResponse({ conversations });
      }

      if (request.method === "POST") {
        const body = await readJson(request);
        if (!isRecord(body) || typeof body.message !== "string") {
          return jsonResponse({ error: "message_required" }, 400);
        }
        if (typeof body.conversationId === "string") {
          const message = await appendUserMessage(user, body.conversationId, body.message);
          return jsonResponse({ message }, 201);
        }
        const created = await createConversation(user, body.message);
        return jsonResponse(created, 201);
      }

      return jsonResponse({ error: "method_not_allowed" }, 405);
    },
    (error) => {
      if (error instanceof ConversationInputError) return jsonResponse({ error: "invalid_message", message: error.message }, 400);
      if (error instanceof ConversationNotFoundError) return jsonResponse({ error: "conversation_not_found" }, 404);
      return null;
    },
  );
}
