# Telya UI/UX Inspo Scrutinization & Architectural Blueprint

This document analyzes and synthesizes the design inspirations, visual standards, and workflow patterns provided for **Telya**. Repository product and architecture documents remain authoritative when a reference pattern conflicts with frozen scope.

---

## 1. Comparative Analysis of Referenced Products

### A. Family (`family.co` & Family Web Onboarding)
- **Visual Essence**: Serene luxury, frosted glassmorphism, soft pill geometries, warm ceramic surfaces.
- **Onboarding UX**:
  - The gold standard for crypto onboarding: **Zero seed-phrase anxiety**.
  - One-tap WebAuthn passkey registration (Face ID / Touch ID).
  - Clean handle claiming (`@username`) with instant inline availability validation.
  - Generative avatars with subtle gradient rings.
- **Telya Translation**:
  - Telya uses this exact passkey-first onboarding flow to initialize the **Stellar Smart Account Kit**.
  - The `@username` registration flow adopts Family's centered card presentation, real-time debounced checks, and friendly confirmation banners.

### B. Wise (`wise.com` & Wise Web Onboarding)
- **Visual Essence**: Institutional trust, clear financial hierarchy, green confidence accents, absolute fee transparency.
- **Payment & Tracking UX**:
  - **"You send / They get" Calculator**: Every single penny, fee, and rate guarantee is explained before the user clicks pay.
  - **Step-by-Step Payment Timeline**: Linear vertical tracker (*Set up → We receive → Conversion → Delivered*) that completely demystifies financial transit.
- **Telya Translation**:
  - Telya implements Wise's fee transparency in the payment review card (guaranteeing exact recipient amount and showing sponsored fees).
  - Telya adopts the Wise stage tracker for the **"Where is my money right now?"** live timeline, showing real state transitions across Stellar and Circle CCTP.

### C. CowryPay (`cowrypay.xyz`)
- **Core Value**: **"Talk-to-Pay" AI Automation Flow & Multi-chain Simplification**.
- **The Flow Scheme**:
  1. *Natural Language Input*: User speaks or types payment intent (e.g., *"Send 10 USDC to @alice"*).
  2. *AI Intent Extraction*: LLM parses structured parameters (recipient, amount, currency, network hints).
  3. *Deterministic Orchestration*: Backend resolves recipient, verifies balance, determines route (Direct vs CCTP), and calculates fees.
  4. *Deterministic Review Card*: Pre-flight review card rendered to the user.
  5. *Human Biometric Authorization*: User confirms via device passkey/biometrics (the AI never touches keys or signs).
  6. *Progress & Finality*: Live timeline monitors real blockchain and CCTP attestations until destination settlement.
- **Telya Translation**:
  - CowryPay's conversational flow is adopted as Telya's core payment model, with the added security guarantee that all AI execution is bounded by deterministic rules and passkey biometric signing.

### D. Talise (`talise.io`)
- **Core Value**: **Self-custodial handle payments (`@username`) & on-chain Agent Passes**.
- **Key Concepts**:
  - Sending money by handle feels like messaging a friend.
  - **Agent Pass**: On-chain spending allowances (enforced by smart contracts) granting agents cumulative limits, expiry, and owner-authorized revocation.
  - Passkey-backed self-custody with zero private key handling by servers.
- **Telya Translation**:
  - Directly informs Telya's **Stellar Agent Pass** UI: a digital card displaying the cumulative allowance, verified spend, expiration ledger, and one-tap revocation.

### E. Linear (`linear.app` & Linear Web Onboarding) & Raycast (`raycast.com`)
- **Visual Essence**: Razor-sharp craft, dark/light precision, subtle 1px border tokens (`border-white/5` or `border-black/5`), keyboard-first speed (`Cmd+K`, Enter, Esc).
- **Telya Translation**:
  - Fast keyboard shortcuts for composer actions.
  - High typographic discipline with tabular numerical figures for all financial amounts.
  - Technical Inspector / Judge Mode overlay allowing hackathon evaluators to toggle deep RPC and event logs without compromising consumer simplicity.

### F. Revolut & Monzo
- **Key Patterns**:
  - Instant mobile handoff and QR pairing.
  - Categorized transaction receipts with verified status pills.
  - Human microcopy that reassures without condescending.

---

## 2. Synthesized Design Tokens & Architecture

The resulting Telya design system combines:
1. **Family's Warm Surfaces & Passkey Simplicity** (`--surface: rgba(255, 255, 255, 0.88)`, `--radius-md: 14px`)
2. **Wise's Unmistakable Stage Progression & Fee Clarity** (`--proof: #167E6C`, exact recipient amount guarantee)
3. **Linear's Precision Micro-Borders & Keyboard Speed** (`--edge: #E3E4E8`, instant action chips)
4. **Talise's Handle-First Payments & Agent Pass Cards** (Stellar Smart Account allowances with progress meters)
5. **CowryPay's Talk-to-Pay Automation Scheme** (AI intent extraction → Deterministic review → Passkey signing)

---

## 3. Implementation Quality Gates

These remain unchecked until the responsive shell is implemented and verified:

- [ ] **No Emojis as UI Icons**: Navigation, action, and status icons use SVG only.
- [ ] **Stable Hover States**: Hover transitions do not introduce layout shifts.
- [ ] **Pointer and Keyboard Semantics**: Interactive elements expose correct cursor, focus, and keyboard behavior.
- [ ] **Accessible Contrast**: Implemented text and controls satisfy WCAG 2.1 AA.
- [ ] **Tabular Numerics**: `tabular-nums lining-nums` is applied to balances, rates, and fee amounts.
- [ ] **Deterministic Safety**: AI never signs; owner payments use passkey authorization, while Agent Pass payments remain bounded by their on-chain rule.
