import type { Network } from "./contracts";

export type VerifiedContactDestination = {
  readonly network: Network;
  readonly address: string;
};

export type VerifiedContact = {
  readonly id: string;
  readonly displayName: string;
  readonly username: string;
  readonly preferredReceiveNetwork: Network | null;
  readonly destinations: readonly VerifiedContactDestination[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function address(network: Network, value: unknown): value is string {
  if (typeof value !== "string") return false;
  return network === "base"
    ? /^0x[0-9a-f]{40}$/i.test(value)
    : /^[CGM][A-Z2-7]{55}$/.test(value);
}

export function parseVerifiedContact(value: unknown): VerifiedContact | null {
  const contact = record(value);
  if (
    !contact || !uuid(contact.id) ||
    typeof contact.displayName !== "string" || !contact.displayName.trim() ||
    typeof contact.username !== "string" || !/^[a-z0-9_]{3,30}$/.test(contact.username) ||
    !(contact.preferredReceiveNetwork === null || contact.preferredReceiveNetwork === "stellar" || contact.preferredReceiveNetwork === "base") ||
    !Array.isArray(contact.destinations) ||
    !timestamp(contact.createdAt) || !timestamp(contact.updatedAt)
  ) return null;
  const destinations: VerifiedContactDestination[] = [];
  for (const value of contact.destinations) {
    const destination = record(value);
    if (
      !destination ||
      !(destination.network === "stellar" || destination.network === "base") ||
      destination.isVerified !== true ||
      !address(destination.network, destination.address)
    ) return null;
    destinations.push({ network: destination.network, address: destination.address });
  }
  return {
    id: contact.id,
    displayName: contact.displayName.trim(),
    username: contact.username,
    preferredReceiveNetwork: contact.preferredReceiveNetwork,
    destinations,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

export function parseVerifiedContacts(value: unknown): readonly VerifiedContact[] | null {
  const payload = record(value);
  if (!payload || !Array.isArray(payload.contacts)) return null;
  const contacts = payload.contacts.map(parseVerifiedContact);
  return contacts.some((contact) => contact === null)
    ? null
    : contacts as VerifiedContact[];
}

export function parseSavedContact(value: unknown): VerifiedContact | null {
  return parseVerifiedContact(record(value)?.contact);
}
