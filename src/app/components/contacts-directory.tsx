"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Loader2, Search, Send, Trash2, UserPlus, Users, X } from "lucide-react";

import type { Network } from "../../domain/contracts";
import {
  parseSavedContact,
  parseVerifiedContacts,
  type VerifiedContact,
} from "../../domain/contact-directory";
import { authenticatedFetch } from "../authenticated-fetch";
import { createSessionRequestGuard, type SessionRequestGuard } from "../session-request-guard";

interface ContactsDirectoryProps {
  readonly onSelectPayContact: (handle: string, network?: Network) => void;
  readonly onClose?: () => void;
}

export function ContactsDirectory(props: ContactsDirectoryProps) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <UnavailableContacts {...props} />;
  }
  return <AuthenticatedContacts {...props} />;
}

function UnavailableContacts({ onClose }: ContactsDirectoryProps) {
  return (
    <div className="contacts-directory-container" role="region" aria-label="Contacts Directory">
      <ContactsHeader {...(onClose ? { onClose } : {})} />
      <div className="contacts-empty-state" role="status">
        <Users className="empty-icon" />
        <p className="empty-title">Contacts unavailable</p>
        <p className="empty-sub">
          Sign-in is not configured, so Telya cannot read authenticated contact records.
          No demo contacts or addresses are substituted.
        </p>
      </div>
    </div>
  );
}

function ContactsHeader({ onClose, onAdd }: {
  readonly onClose?: () => void;
  readonly onAdd?: () => void;
}) {
  return (
    <div className="contacts-header">
      <div className="contacts-title-group">
        <div className="contacts-kicker"><Users className="mini-icon" /><span>Verified recipients</span></div>
        <h2 className="contacts-title">Contacts Directory</h2>
        <p className="contacts-sub">Owner-scoped usernames and verified wallet destinations from Telya persistence.</p>
      </div>
      <div className="contacts-header-actions">
        {onAdd && (
          <button type="button" className="cta-button primary add-contact-btn" onClick={onAdd}>
            <UserPlus className="btn-icon" /><span>Save username</span>
          </button>
        )}
        {onClose && (
          <button type="button" className="close-panel-btn" onClick={onClose} aria-label="Close">
            <X className="close-icon" />
          </button>
        )}
      </div>
    </div>
  );
}

function AuthenticatedContacts({ onSelectPayContact, onClose }: ContactsDirectoryProps) {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const [contacts, setContacts] = useState<readonly VerifiedContact[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [username, setUsername] = useState("");
  const [preferredNetwork, setPreferredNetwork] = useState<Network | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionGuardRef = useRef<SessionRequestGuard | null>(null);

  const request = useCallback(
    (input: string, init: RequestInit = {}) => authenticatedFetch(input, init, getAccessToken),
    [getAccessToken],
  );

  const loadContacts = useCallback(async (guard: SessionRequestGuard) => {
    if (!guard.isActive()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await request("/api/contacts", { cache: "no-store" });
      const payload: unknown = await response.json();
      const parsed = response.ok ? parseVerifiedContacts(payload) : null;
      if (!parsed) throw new Error("The authenticated contacts response could not be verified.");
      if (!guard.isActive()) return;
      setContacts(parsed);
    } catch (reason) {
      if (!guard.isActive()) return;
      setContacts([]);
      setError(reason instanceof Error ? reason.message : "Contacts are temporarily unavailable.");
    } finally {
      if (guard.isActive()) setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    sessionGuardRef.current?.cancel();
    sessionGuardRef.current = null;
    if (!ready || !authenticated) {
      setContacts([]);
      setSearch("");
      setShowAdd(false);
      setUsername("");
      setPreferredNetwork("");
      setLoading(false);
      setError(null);
      return;
    }
    setContacts([]);
    setError(null);
    const guard = createSessionRequestGuard();
    sessionGuardRef.current = guard;
    void loadContacts(guard);
    return () => {
      guard.cancel();
      if (sessionGuardRef.current === guard) sessionGuardRef.current = null;
    };
  }, [authenticated, loadContacts, ready]);

  async function saveContact(event: React.FormEvent) {
    event.preventDefault();
    const guard = sessionGuardRef.current;
    if (!guard?.isActive()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await request("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username,
          preferredReceiveNetwork: preferredNetwork || null,
        }),
      });
      const payload: unknown = await response.json();
      const saved = response.ok ? parseSavedContact(payload) : null;
      if (!saved) throw new Error("That username could not be saved as a verified contact.");
      if (!guard.isActive()) return;
      setContacts((previous) => [saved, ...previous.filter((contact) => contact.id !== saved.id)]);
      setUsername("");
      setPreferredNetwork("");
      setShowAdd(false);
    } catch (reason) {
      if (!guard.isActive()) return;
      setError(reason instanceof Error ? reason.message : "The contact could not be saved.");
    } finally {
      if (guard.isActive()) setLoading(false);
    }
  }

  async function removeContact(contactId: string) {
    const guard = sessionGuardRef.current;
    if (!guard?.isActive()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await request(`/api/contacts?id=${encodeURIComponent(contactId)}`, { method: "DELETE" });
      if (response.status !== 204) throw new Error("The contact could not be removed from persistence.");
      if (!guard.isActive()) return;
      setContacts((previous) => previous.filter((contact) => contact.id !== contactId));
    } catch (reason) {
      if (!guard.isActive()) return;
      setError(reason instanceof Error ? reason.message : "The contact could not be removed.");
    } finally {
      if (guard.isActive()) setLoading(false);
    }
  }

  if (!ready) return <UnavailableContacts onSelectPayContact={onSelectPayContact} {...(onClose ? { onClose } : {})} />;
  if (!authenticated) {
    return (
      <div className="contacts-directory-container" role="region" aria-label="Contacts Directory">
        <ContactsHeader {...(onClose ? { onClose } : {})} />
        <div className="contacts-empty-state">
          <Users className="empty-icon" />
          <p className="empty-title">Sign in to load contacts</p>
          <p className="empty-sub">Contacts are never restored from browser storage.</p>
          <button type="button" className="cta-button primary" onClick={login}>Sign in</button>
        </div>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filtered = contacts.filter((contact) => !query ||
    contact.displayName.toLowerCase().includes(query) || contact.username.includes(query));

  return (
    <div className="contacts-directory-container" role="region" aria-label="Contacts Directory">
      <ContactsHeader {...(onClose ? { onClose } : {})} onAdd={() => setShowAdd(true)} />
      {error && <div className="form-error-banner" role="alert">{error}</div>}
      <div className="contacts-search-box">
        <Search className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search saved contacts…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {loading && contacts.length === 0 ? (
        <div className="contacts-empty-state" role="status"><Loader2 className="empty-icon spinner" /><p>Loading persisted contacts…</p></div>
      ) : filtered.length === 0 ? (
        <div className="contacts-empty-state" role="status">
          <Users className="empty-icon" />
          <p className="empty-title">No verified contacts found</p>
          <p className="empty-sub">Save an active Telya username; payment actions remain disabled until it has a verified wallet.</p>
        </div>
      ) : (
        <div className="contacts-list">
          {filtered.map((contact) => (
            <div className="contact-card" key={contact.id}>
              <div className="contact-card-left">
                <div className="contact-avatar">{contact.displayName.slice(0, 2).toUpperCase()}</div>
                <div className="contact-info">
                  <div className="contact-name-row"><strong>{contact.displayName}</strong><span className="contact-handle">@{contact.username}</span></div>
                  <div className="contact-network-row">
                    {contact.destinations.length === 0 ? (
                      <span className="pref-label">No verified wallet destination</span>
                    ) : contact.destinations.map((destination) => (
                      <span className={`pref-network-tag ${destination.network}`} key={`${destination.network}:${destination.address}`}>
                        {destination.network === "stellar" ? "Verified Stellar" : "Verified Base"}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="contact-card-actions">
                {contact.destinations.map((destination) => (
                  <button
                    type="button"
                    className="pay-contact-btn"
                    key={`${destination.network}:${destination.address}`}
                    onClick={() => onSelectPayContact(`@${contact.username}`, destination.network)}
                  >
                    <Send className="btn-icon-sm" /><span>Pay on {destination.network === "stellar" ? "Stellar" : "Base"}</span>
                  </button>
                ))}
                <button type="button" className="delete-contact-btn" onClick={() => { void removeContact(contact.id); }} aria-label={`Remove @${contact.username}`}>
                  <Trash2 className="trash-icon" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Save verified contact">
          <div className="add-contact-modal">
            <div className="modal-header"><h3>Save Telya username</h3><button type="button" className="close-modal-btn" onClick={() => setShowAdd(false)}><X className="close-icon" /></button></div>
            <form className="add-contact-form" onSubmit={(event) => { void saveContact(event); }}>
              <div className="form-field"><label htmlFor="contactUsername">Telya username</label><input id="contactUsername" className="text-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="@username" required /></div>
              <div className="form-field"><label htmlFor="preferredNetwork">Preferred receive network</label><select id="preferredNetwork" className="select-input" value={preferredNetwork} onChange={(event) => setPreferredNetwork(event.target.value as Network | "")}><option value="">Ask when needed</option><option value="stellar">Stellar</option><option value="base">Base</option></select></div>
              <p className="empty-sub">Telya resolves the active username server-side. No wallet address is entered or trusted here.</p>
              <div className="modal-actions"><button type="button" className="cancel-btn" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="cta-button primary" disabled={loading}>{loading ? "Saving…" : "Save contact"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
