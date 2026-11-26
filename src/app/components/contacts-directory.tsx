"use client";

import { useEffect, useState } from "react";
import type { Contact, Network } from "../../domain/contracts";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Plus,
  Search,
  Send,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface ContactsDirectoryProps {
  readonly onSelectPayContact: (handle: string, network?: Network) => void;
  readonly onClose?: () => void;
}

const STORAGE_CONTACTS_KEY = "telya_contacts_directory";

// Default realistic demo contacts for judges and testnet testers
const SEEDED_CONTACTS: readonly Contact[] = [
  {
    id: "contact_alice",
    ownerUserId: "system",
    displayName: "Alice Vance",
    username: "alice",
    destinations: [
      {
        network: "stellar",
        address: "CDMZP4Y6Y5W57GPYJ6Z2V637AAYY2V7L7D4U2QY35D2L4F5E6X7Y8Z90",
        isVerified: true,
      },
    ],
    preferredReceiveNetwork: "stellar",
    createdAt: "2026-11-20T10:00:00Z",
    updatedAt: "2026-11-20T10:00:00Z",
  },
  {
    id: "contact_bob",
    ownerUserId: "system",
    displayName: "Bob Martinez",
    username: "bob",
    destinations: [
      {
        network: "base",
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        isVerified: true,
      },
    ],
    preferredReceiveNetwork: "base",
    createdAt: "2026-11-21T12:00:00Z",
    updatedAt: "2026-11-21T12:00:00Z",
  },
  {
    id: "contact_builder",
    ownerUserId: "system",
    displayName: "Stellar Builder",
    username: "builder",
    destinations: [
      {
        network: "stellar",
        address: "CA3D2C1B4A5F6E7D8C9B0A1F2E3D4C5B6A7F8E9D0C1B2A3F4E5D6C7B8A9F0E1",
        isVerified: true,
      },
    ],
    preferredReceiveNetwork: "stellar",
    createdAt: "2026-11-22T08:00:00Z",
    updatedAt: "2026-11-22T08:00:00Z",
  },
];

export function ContactsDirectory({
  onSelectPayContact,
  onClose,
}: ContactsDirectoryProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Add form fields
  const [newHandle, setNewHandle] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [preferredNetwork, setPreferredNetwork] = useState<Network>("stellar");
  const [formError, setFormError] = useState<string | null>(null);
  const [isCheckingHandle, setIsCheckingHandle] = useState(false);

  // Load contacts
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_CONTACTS_KEY);
      if (stored) {
        setContacts(JSON.parse(stored));
      } else {
        setContacts([...SEEDED_CONTACTS]);
        localStorage.setItem(STORAGE_CONTACTS_KEY, JSON.stringify(SEEDED_CONTACTS));
      }
    } catch {
      setContacts([...SEEDED_CONTACTS]);
    }
  }, []);

  function saveContacts(updated: Contact[]) {
    setContacts(updated);
    try {
      localStorage.setItem(STORAGE_CONTACTS_KEY, JSON.stringify(updated));
    } catch {}
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    const handleClean = newHandle.trim().replace(/^@/, "").toLowerCase();
    if (!handleClean) return;

    setIsCheckingHandle(true);
    setFormError(null);

    try {
      // Check if handle is already in local list
      if (contacts.some((c) => c.username?.toLowerCase() === handleClean)) {
        setFormError(`@${handleClean} is already in your contacts.`);
        setIsCheckingHandle(false);
        return;
      }

      const newContact: Contact = {
        id: `contact_${Date.now()}`,
        ownerUserId: "local_user",
        displayName: newDisplayName.trim() || `@${handleClean}`,
        username: handleClean,
        destinations: [
          {
            network: preferredNetwork,
            address:
              preferredNetwork === "stellar"
                ? `C${Date.now()}STELLARDESTINATION`
                : `0x${Date.now()}BASEDESTINATION`,
            isVerified: true,
          },
        ],
        preferredReceiveNetwork: preferredNetwork,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updated = [newContact, ...contacts];
      saveContacts(updated);
      setNewHandle("");
      setNewDisplayName("");
      setShowAddModal(false);
    } catch {
      setFormError("Could not add contact. Please retry.");
    } finally {
      setIsCheckingHandle(false);
    }
  }

  function handleDeleteContact(contactId: string) {
    const updated = contacts.filter((c) => c.id !== contactId);
    saveContacts(updated);
  }

  const filteredContacts = contacts.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.displayName.toLowerCase().includes(q) ||
      (c.username && c.username.toLowerCase().includes(q))
    );
  });

  return (
    <div className="contacts-directory-container" role="region" aria-label="Contacts Directory">
      {/* Header */}
      <div className="contacts-header">
        <div className="contacts-title-group">
          <div className="contacts-kicker">
            <Users className="mini-icon" />
            <span>Frequent Recipients</span>
          </div>
          <h2 className="contacts-title">Contacts Directory</h2>
          <p className="contacts-sub">
            Save unique handles and preferred networks for instant 1-tap transfers without typing.
          </p>
        </div>

        <div className="contacts-header-actions">
          <button
            type="button"
            className="cta-button primary add-contact-btn"
            onClick={() => setShowAddModal(true)}
          >
            <UserPlus className="btn-icon" />
            <span>Add Contact</span>
          </button>

          {onClose && (
            <button type="button" className="close-panel-btn" onClick={onClose} aria-label="Close">
              <X className="close-icon" />
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="contacts-search-box">
        <Search className="search-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search by name or @handle..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Contacts List */}
      <div className="contacts-list">
        {filteredContacts.length === 0 ? (
          <div className="contacts-empty-state">
            <Users className="empty-icon" />
            <p className="empty-title">No contacts found</p>
            <p className="empty-sub">
              Add friends or test accounts using their unique @username to make 1-tap transfers.
            </p>
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const handleText = `@${contact.username}`;
            const preferredNet = contact.preferredReceiveNetwork ?? "stellar";

            return (
              <div key={contact.id} className="contact-card">
                <div className="contact-card-left">
                  <div className="contact-avatar">
                    <span>
                      {contact.displayName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  <div className="contact-info">
                    <div className="contact-name-row">
                      <strong>{contact.displayName}</strong>
                      <span className="contact-handle">{handleText}</span>
                    </div>

                    <div className="contact-network-row">
                      <span className="pref-label">Receives on:</span>
                      <span className={`pref-network-tag ${preferredNet}`}>
                        {preferredNet === "stellar" ? "Stellar USDC" : "Base USDC"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="contact-card-actions">
                  <button
                    type="button"
                    className="pay-contact-btn"
                    onClick={() => onSelectPayContact(handleText, preferredNet)}
                    title={`Send digital dollars to ${handleText}`}
                  >
                    <Send className="btn-icon-sm" />
                    <span>Pay</span>
                  </button>

                  <button
                    type="button"
                    className="delete-contact-btn"
                    onClick={() => handleDeleteContact(contact.id)}
                    title="Remove contact"
                  >
                    <Trash2 className="trash-icon" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="add-contact-modal">
            <div className="modal-header">
              <h3>Add New Contact</h3>
              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setShowAddModal(false)}
              >
                <X className="close-icon" />
              </button>
            </div>

            <form onSubmit={handleAddContact} className="add-contact-form">
              {formError && <div className="form-error-banner">{formError}</div>}

              <div className="form-field">
                <label htmlFor="handleInput">Telya Handle</label>
                <div className="input-with-affix">
                  <span className="affix">@</span>
                  <input
                    id="handleInput"
                    type="text"
                    placeholder="alice"
                    value={newHandle}
                    onChange={(e) => setNewHandle(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="nameInput">Display Name (Optional)</label>
                <input
                  id="nameInput"
                  type="text"
                  placeholder="e.g. Alice Vance"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="text-input"
                />
              </div>

              <div className="form-field">
                <label>Preferred Receive Network</label>
                <div className="network-radio-group">
                  <label
                    className={`network-radio-card ${
                      preferredNetwork === "stellar" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="network"
                      value="stellar"
                      checked={preferredNetwork === "stellar"}
                      onChange={() => setPreferredNetwork("stellar")}
                    />
                    <div className="radio-text">
                      <strong>Stellar Testnet</strong>
                      <span>Zero-fee instant transfer</span>
                    </div>
                  </label>

                  <label
                    className={`network-radio-card ${
                      preferredNetwork === "base" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="network"
                      value="base"
                      checked={preferredNetwork === "base"}
                      onChange={() => setPreferredNetwork("base")}
                    />
                    <div className="radio-text">
                      <strong>Base Sepolia</strong>
                      <span>Circle CCTP Cross-Chain</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cta-button primary"
                  disabled={isCheckingHandle}
                >
                  {isCheckingHandle ? "Saving..." : "Save Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
