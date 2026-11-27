import { authenticateRequest } from "../auth/privy.ts";
import {
  AmbiguousRecipientError,
  ContactInputError,
  ContactNotFoundError,
  listContacts,
  removeContact,
  saveContact,
} from "../contacts/service.ts";
import { createAuthenticatedHandler, isRecord, jsonResponse, readJson } from "./http.ts";
import type { AuthenticateRequest } from "./http.ts";

export function createContactsHandler(options: { authenticate?: AuthenticateRequest } = {}) {
  return createAuthenticatedHandler(
    options.authenticate ?? authenticateRequest,
    async (request, user) => {
      if (request.method === "GET") return jsonResponse({ contacts: await listContacts(user) });

      if (request.method === "POST") {
        const body = await readJson(request);
        if (!isRecord(body) || typeof body.username !== "string") {
          return jsonResponse({ error: "username_required" }, 400);
        }
        if (body.displayName !== undefined && body.displayName !== null && typeof body.displayName !== "string") {
          return jsonResponse({ error: "invalid_display_name" }, 400);
        }
        if (
          body.preferredReceiveNetwork !== undefined &&
          body.preferredReceiveNetwork !== null &&
          body.preferredReceiveNetwork !== "stellar" &&
          body.preferredReceiveNetwork !== "base"
        ) return jsonResponse({ error: "invalid_preferred_receive_network" }, 400);
        const contact = await saveContact(user, {
          username: body.username,
          displayName: typeof body.displayName === "string" ? body.displayName : null,
          preferredReceiveNetwork: body.preferredReceiveNetwork === "stellar" || body.preferredReceiveNetwork === "base"
            ? body.preferredReceiveNetwork
            : null,
        });
        return jsonResponse({ contact }, 201);
      }

      if (request.method === "DELETE") {
        const contactId = new URL(request.url).searchParams.get("id") ?? "";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId)) {
          return jsonResponse({ error: "invalid_contact_id" }, 400);
        }
        const deleted = await removeContact(user, contactId);
        return deleted ? new Response(null, { status: 204 }) : jsonResponse({ error: "contact_not_found" }, 404);
      }

      return jsonResponse({ error: "method_not_allowed" }, 405);
    },
    (error) => {
      if (error instanceof ContactInputError) return jsonResponse({ error: "invalid_contact", message: error.message }, 400);
      if (error instanceof ContactNotFoundError) return jsonResponse({ error: "contact_unavailable", message: error.message }, 404);
      if (error instanceof AmbiguousRecipientError) return jsonResponse({ error: "ambiguous_recipient" }, 409);
      return null;
    },
  );
}
