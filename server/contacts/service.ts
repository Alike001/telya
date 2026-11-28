import { StrKey } from "@stellar/stellar-sdk/base";
import type { AuthenticatedUser } from "../auth/privy.ts";
import { getSqlClient } from "../db/client.ts";
import type { ContactDestination, Network, RecipientReference } from "../../src/domain/contracts.ts";

export type ContactRecord = {
  readonly id: string;
  readonly displayName: string;
  readonly username: string;
  readonly preferredReceiveNetwork: Network | null;
  readonly destinations: readonly ContactDestination[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ResolvedRecipient = {
  readonly reference: RecipientReference;
  readonly resolvedUserId: string | null;
  readonly username: string | null;
  readonly displayName: string;
  readonly destinations: readonly ContactDestination[];
  readonly preferredReceiveNetwork: Network | null;
};

export class ContactInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactInputError";
  }
}

export class ContactNotFoundError extends Error {
  constructor(message = "Contact or recipient was not found") {
    super(message);
    this.name = "ContactNotFoundError";
  }
}

export class AmbiguousRecipientError extends Error {
  constructor() {
    super("More than one contact matches this recipient. Select a contact.");
    this.name = "AmbiguousRecipientError";
  }
}

function asNetwork(value: unknown): Network | null {
  return value === "stellar" || value === "base" ? value : null;
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapDestinations(value: unknown): ContactDestination[] {
  const parsed = jsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry): ContactDestination[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const destination = entry as Record<string, unknown>;
    const network = asNetwork(destination.network);
    if (network === null || typeof destination.address !== "string") return [];
    return [{ network, address: destination.address, isVerified: destination.isVerified === true }];
  });
}

function mapContact(row: Record<string, unknown>): ContactRecord {
  const username = typeof row.username === "string" ? row.username : "";
  return {
    id: String(row.id),
    displayName: typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name
      : `@${username}`,
    username,
    preferredReceiveNetwork: asNetwork(row.preferred_receive_network),
    destinations: mapDestinations(row.destinations),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function normalizeLookup(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

function detectDirectAddress(input: string): ContactDestination | null {
  const address = input.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { network: "base", address, isVerified: false };
  }
  if (
    StrKey.isValidEd25519PublicKey(address) ||
    StrKey.isValidContract(address) ||
    StrKey.isValidMed25519PublicKey(address)
  ) {
    return { network: "stellar", address, isVerified: false };
  }
  return null;
}

async function contactRowsForUser(userId: string, contactId?: string): Promise<Record<string, unknown>[]> {
  const sql = getSqlClient();
  const rows = contactId
    ? await sql`
        SELECT
          c.id,
          COALESCE(c.display_name, ur.username_display) AS display_name,
          c.username_normalized AS username,
          c.preferred_receive_network,
          c.created_at,
          c.updated_at,
          COALESCE(
            json_agg(DISTINCT jsonb_build_object(
              'network', destinations.network,
              'address', destinations.address,
              'isVerified', destinations.is_verified
            )) FILTER (WHERE destinations.address IS NOT NULL),
            '[]'::json
          ) AS destinations
        FROM contacts c
        JOIN username_registry ur ON ur.username_normalized = c.username_normalized
        LEFT JOIN LATERAL (
          SELECT w.network, w.address, true AS is_verified
          FROM wallets w
          WHERE w.user_id = c.resolved_user_id AND w.verification_status = 'verified'
          UNION
          SELECT cw.network, cw.address, true AS is_verified
          FROM contact_wallets cw
          WHERE cw.contact_id = c.id AND cw.verification_status = 'verified'
        ) destinations ON true
        WHERE c.owner_user_id = ${userId}::uuid AND c.id = ${contactId}::uuid
        GROUP BY c.id, ur.username_display
        LIMIT 1
      `
    : await sql`
        SELECT
          c.id,
          COALESCE(c.display_name, ur.username_display) AS display_name,
          c.username_normalized AS username,
          c.preferred_receive_network,
          c.created_at,
          c.updated_at,
          COALESCE(
            json_agg(DISTINCT jsonb_build_object(
              'network', destinations.network,
              'address', destinations.address,
              'isVerified', destinations.is_verified
            )) FILTER (WHERE destinations.address IS NOT NULL),
            '[]'::json
          ) AS destinations
        FROM contacts c
        JOIN username_registry ur ON ur.username_normalized = c.username_normalized
        LEFT JOIN LATERAL (
          SELECT w.network, w.address, true AS is_verified
          FROM wallets w
          WHERE w.user_id = c.resolved_user_id AND w.verification_status = 'verified'
          UNION
          SELECT cw.network, cw.address, true AS is_verified
          FROM contact_wallets cw
          WHERE cw.contact_id = c.id AND cw.verification_status = 'verified'
        ) destinations ON true
        WHERE c.owner_user_id = ${userId}::uuid
        GROUP BY c.id, ur.username_display
        ORDER BY c.updated_at DESC, c.id
      `;
  return rows as Record<string, unknown>[];
}

export async function listContacts(user: Pick<AuthenticatedUser, "id">): Promise<ContactRecord[]> {
  const rows = await contactRowsForUser(user.id);
  return rows.map(mapContact);
}

export async function getContact(
  user: Pick<AuthenticatedUser, "id">,
  contactId: string,
): Promise<ContactRecord | null> {
  const rows = await contactRowsForUser(user.id, contactId);
  return rows[0] ? mapContact(rows[0]) : null;
}

export async function saveContact(user: Pick<AuthenticatedUser, "id">, input: {
  readonly username: string;
  readonly displayName?: string | null;
  readonly preferredReceiveNetwork?: Network | null;
}): Promise<ContactRecord> {
  const username = normalizeLookup(input.username);
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    throw new ContactInputError("Enter a valid Telya username");
  }
  const displayName = input.displayName?.trim() || null;
  if (displayName && displayName.length > 80) throw new ContactInputError("Display name is too long");
  const preferredNetwork = input.preferredReceiveNetwork ?? null;
  if (preferredNetwork !== null && preferredNetwork !== "stellar" && preferredNetwork !== "base") {
    throw new ContactInputError("Preferred network must be Stellar or Base");
  }

  const sql = getSqlClient();
  const rows = await sql`
    INSERT INTO contacts (
      owner_user_id,
      username_normalized,
      resolved_user_id,
      display_name,
      preferred_receive_network
    )
    SELECT
      ${user.id}::uuid,
      registry.username_normalized,
      registry.user_id,
      ${displayName},
      ${preferredNetwork}
    FROM username_registry registry
    WHERE registry.username_normalized = ${username}
      AND registry.status = 'active'
      AND registry.user_id <> ${user.id}::uuid
    ON CONFLICT (owner_user_id, username_normalized) DO UPDATE SET
      resolved_user_id = EXCLUDED.resolved_user_id,
      display_name = EXCLUDED.display_name,
      preferred_receive_network = EXCLUDED.preferred_receive_network,
      updated_at = now()
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (typeof id !== "string") throw new ContactNotFoundError("That username is unavailable or has no account");
  const contact = await getContact(user, id);
  if (!contact) throw new ContactNotFoundError();
  return contact;
}

export async function removeContact(
  user: Pick<AuthenticatedUser, "id">,
  contactId: string,
): Promise<boolean> {
  const sql = getSqlClient();
  const [, rows] = await sql.transaction([
    sql`
      DELETE FROM contact_wallets cw
      USING contacts c
      WHERE cw.contact_id = c.id
        AND c.id = ${contactId}::uuid
        AND c.owner_user_id = ${user.id}::uuid
    `,
    sql`
      DELETE FROM contacts
      WHERE id = ${contactId}::uuid AND owner_user_id = ${user.id}::uuid
      RETURNING id
    `,
  ]);
  return (rows?.length ?? 0) > 0;
}

async function resolveContactRecipient(
  user: Pick<AuthenticatedUser, "id">,
  lookup: string,
): Promise<ResolvedRecipient | null> {
  const sql = getSqlClient();
  const rows = await sql`
    SELECT c.id, c.resolved_user_id, c.username_normalized, c.display_name,
      c.preferred_receive_network
    FROM contacts c
    WHERE c.owner_user_id = ${user.id}::uuid
      AND (
        c.username_normalized = ${lookup}
        OR lower(trim(COALESCE(c.display_name, ''))) = ${lookup}
      )
    ORDER BY c.id
    LIMIT 2
  `;
  if (rows.length > 1) throw new AmbiguousRecipientError();
  const row = rows[0];
  if (!row) return null;

  const contact = await getContact(user, String(row.id));
  if (!contact) return null;
  if (contact.destinations.length === 0) {
    throw new ContactNotFoundError("This contact has no verified wallet yet");
  }
  return {
    reference: { kind: "contact", contactId: contact.id },
    resolvedUserId: typeof row.resolved_user_id === "string" ? row.resolved_user_id : null,
    username: contact.username,
    displayName: contact.displayName,
    destinations: contact.destinations,
    preferredReceiveNetwork: contact.preferredReceiveNetwork,
  };
}

/** Resolve a literal address, saved contact, or active username to wallet destinations. */
export async function resolveRecipient(
  user: Pick<AuthenticatedUser, "id">,
  recipientInput: string,
): Promise<ResolvedRecipient> {
  const raw = recipientInput.trim();
  if (!raw || raw.length > 160) throw new ContactInputError("Enter a recipient name, username, or wallet address");

  const directAddress = detectDirectAddress(raw);
  if (directAddress) {
    return {
      reference: { kind: "address", network: directAddress.network, address: directAddress.address },
      resolvedUserId: null,
      username: null,
      displayName: directAddress.address,
      destinations: [directAddress],
      preferredReceiveNetwork: null,
    };
  }

  const lookup = normalizeLookup(raw);
  const contact = await resolveContactRecipient(user, lookup);
  if (contact) return contact;

  if (!/^[a-z0-9_]{3,30}$/.test(lookup)) throw new ContactNotFoundError();
  const sql = getSqlClient();
  const rows = await sql`
    SELECT registry.user_id, registry.username_normalized, registry.username_display,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object(
          'network', w.network,
          'address', w.address,
          'isVerified', true
        )) FILTER (WHERE w.address IS NOT NULL),
        '[]'::json
      ) AS destinations
    FROM username_registry registry
    LEFT JOIN wallets w ON w.user_id = registry.user_id AND w.verification_status = 'verified'
    WHERE registry.username_normalized = ${lookup}
      AND registry.status = 'active'
      AND registry.user_id <> ${user.id}::uuid
    GROUP BY registry.user_id, registry.username_normalized, registry.username_display
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new ContactNotFoundError();
  const destinations = mapDestinations(row.destinations);
  if (destinations.length === 0) throw new ContactNotFoundError("That user has no verified wallet yet");
  const resolvedUserId = String(row.user_id);
  const username = String(row.username_normalized);
  return {
    reference: { kind: "username", username },
    resolvedUserId,
    username,
    displayName: String(row.username_display),
    destinations,
    preferredReceiveNetwork: null,
  };
}
