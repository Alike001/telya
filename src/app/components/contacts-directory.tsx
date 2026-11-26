"use client";

import type { Network } from "../../domain/contracts";
import { Users, X } from "lucide-react";

interface ContactsDirectoryProps {
  readonly onSelectPayContact: (handle: string, network?: Network) => void;
  readonly onClose?: () => void;
}

/** Contact rows require authenticated, owner-scoped verified wallet records. */
export function ContactsDirectory({ onClose }: ContactsDirectoryProps) {
  return (
    <div className="contacts-directory-container" role="region" aria-label="Contacts Directory">
      <div className="contacts-header">
        <div className="contacts-title-group">
          <div className="contacts-kicker"><Users className="mini-icon" /><span>Frequent Recipients</span></div>
          <h2 className="contacts-title">Contacts Directory</h2>
          <p className="contacts-sub">Your verified contacts will appear here after account sign-in is connected.</p>
        </div>
        {onClose && (
          <button type="button" className="close-panel-btn" onClick={onClose} aria-label="Close">
            <X className="close-icon" />
          </button>
        )}
      </div>
      <div className="contacts-empty-state" role="status">
        <Users className="empty-icon" />
        <p className="empty-title">Contacts unavailable</p>
        <p className="empty-sub">
          Telya cannot verify or save recipient handles until your authenticated contact records are available.
          No demo contacts or addresses are substituted.
        </p>
      </div>
    </div>
  );
}
