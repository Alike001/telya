"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  Clock,
  Home,
  KeyRound,
} from "lucide-react";

type DockTab = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: React.ComponentType<{ className?: string }>;
};

const DOCK_TABS: readonly DockTab[] = [
  { id: "home", label: "Home", href: "#top", icon: Home },
  { id: "transfer", label: "Transfer", href: "#route-preview", icon: ArrowLeftRight },
  { id: "agent-pass", label: "Agent Pass", href: "#agent-pass", icon: KeyRound },
  { id: "activity", label: "Activity", href: "#activity", icon: Clock },
];

export function MobileBottomDock() {
  const [activeTab, setActiveTab] = useState("home");

  return (
    <aside className="mobile-bottom-dock" aria-label="Mobile navigation dock">
      <nav className="dock-container" aria-label="Bottom dock tabs">
        {DOCK_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <a
              key={tab.id}
              href={tab.href}
              className={`dock-tab ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <div className="dock-icon-wrapper">
                <Icon className="dock-icon" aria-hidden="true" />
              </div>
              <span className="dock-label">{tab.label}</span>
              {isActive && <span className="dock-indicator" aria-hidden="true" />}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
