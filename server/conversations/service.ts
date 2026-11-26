import type { AuthenticatedUser } from "../auth/privy.ts";
import { getSqlClient } from "../db/client.ts";

export type ConversationRecord = {
  readonly id: string;
  readonly title: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messageCount?: number;
};

export type ConversationMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly structuredIntent: unknown | null;
  readonly createdAt: string;
};

export class ConversationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationInputError";
  }
}

export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversation was not found");
    this.name = "ConversationNotFoundError";
  }
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function iso(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function parseJson(value: unknown): unknown | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function validateContent(content: string): string {
  const normalized = content.trim();
  if (!normalized) throw new ConversationInputError("Message cannot be empty");
  if (normalized.length > 10_000) throw new ConversationInputError("Message is too long");
  return normalized;
}

export async function createConversation(
  user: Pick<AuthenticatedUser, "id">,
  firstMessage: string,
): Promise<{ conversation: ConversationRecord; message: ConversationMessage }> {
  const content = validateContent(firstMessage);
  const title = content.replace(/\s+/g, " ").slice(0, 80);
  const sql = getSqlClient();
  const rows = await sql`
    WITH conversation AS (
      INSERT INTO conversations (user_id, title)
      VALUES (${user.id}::uuid, ${title})
      RETURNING id, title, created_at, updated_at
    ), message AS (
      INSERT INTO messages (conversation_id, role, content)
      SELECT conversation.id, 'user', ${content}
      FROM conversation
      RETURNING id, conversation_id, role, content, structured_intent, created_at
    )
    SELECT
      conversation.id AS conversation_id,
      conversation.title,
      conversation.created_at AS conversation_created_at,
      conversation.updated_at AS conversation_updated_at,
      message.id AS message_id,
      message.role,
      message.content,
      message.structured_intent,
      message.created_at AS message_created_at
    FROM conversation
    JOIN message ON message.conversation_id = conversation.id
  `;
  const row = rows[0];
  if (!row) throw new Error("Conversation creation returned no row");
  return {
    conversation: {
      id: String(row.conversation_id),
      title: typeof row.title === "string" ? row.title : null,
      createdAt: iso(row.conversation_created_at),
      updatedAt: iso(row.conversation_updated_at),
      messageCount: 1,
    },
    message: {
      id: String(row.message_id),
      role: "user",
      content: String(row.content),
      structuredIntent: parseJson(row.structured_intent),
      createdAt: iso(row.message_created_at),
    },
  };
}

export async function listConversations(
  user: Pick<AuthenticatedUser, "id">,
  limit = 50,
): Promise<ConversationRecord[]> {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 100)) : 50;
  const sql = getSqlClient();
  const rows = await sql`
    SELECT c.id, c.title, c.created_at, c.updated_at, count(m.id)::int AS message_count
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.user_id = ${user.id}::uuid
    GROUP BY c.id
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT ${safeLimit}
  `;
  return rows.map((row) => ({
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    messageCount: Number(row.message_count),
  }));
}

export async function listConversationMessages(
  user: Pick<AuthenticatedUser, "id">,
  conversationId: string,
  limit = 100,
): Promise<ConversationMessage[]> {
  if (!validUuid(conversationId)) throw new ConversationInputError("Invalid conversation ID");
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 200)) : 100;
  const sql = getSqlClient();
  const rows = await sql`
    SELECT m.id, m.role, m.content, m.structured_intent, m.created_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.id = ${conversationId}::uuid AND c.user_id = ${user.id}::uuid
      AND m.role IN ('user', 'assistant')
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ${safeLimit}
  `;
  if (rows.length === 0) {
    const owned = await sql`
      SELECT id FROM conversations
      WHERE id = ${conversationId}::uuid AND user_id = ${user.id}::uuid
      LIMIT 1
    `;
    if (!owned[0]) throw new ConversationNotFoundError();
  }
  return rows.reverse().map((row) => ({
    id: String(row.id),
    role: row.role === "assistant" ? "assistant" : "user",
    content: String(row.content),
    structuredIntent: parseJson(row.structured_intent),
    createdAt: iso(row.created_at),
  }));
}

async function appendMessage(
  user: Pick<AuthenticatedUser, "id">,
  conversationId: string,
  input: string,
  role: "user" | "assistant",
  structuredIntent: unknown | null,
): Promise<ConversationMessage> {
  if (!validUuid(conversationId)) throw new ConversationInputError("Invalid conversation ID");
  const content = validateContent(input);
  const sql = getSqlClient();
  const rows = await sql`
    WITH owned AS (
      UPDATE conversations
      SET updated_at = now()
      WHERE id = ${conversationId}::uuid AND user_id = ${user.id}::uuid
      RETURNING id
    )
    INSERT INTO messages (conversation_id, role, content, structured_intent)
    SELECT owned.id, ${role}, ${content}, ${structuredIntent === null ? null : JSON.stringify(structuredIntent)}::jsonb
    FROM owned
    RETURNING id, role, content, structured_intent, created_at
  `;
  const row = rows[0];
  if (!row) throw new ConversationNotFoundError();
  return {
    id: String(row.id),
    role,
    content: String(row.content),
    structuredIntent: parseJson(row.structured_intent),
    createdAt: iso(row.created_at),
  };
}

export function appendUserMessage(
  user: Pick<AuthenticatedUser, "id">,
  conversationId: string,
  input: string,
): Promise<ConversationMessage> {
  return appendMessage(user, conversationId, input, "user", null);
}

export function appendAssistantMessage(
  user: Pick<AuthenticatedUser, "id">,
  conversationId: string,
  input: string,
  structuredIntent: unknown | null = null,
): Promise<ConversationMessage> {
  return appendMessage(user, conversationId, input, "assistant", structuredIntent);
}
