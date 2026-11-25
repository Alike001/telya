# Telya Brand, Visual Direction & Design System

> **Telya** makes moving digital dollars feel like a conversation, not a blockchain operation.
> This document defines the visual identity, design tokens, color palette, typography, tone, and component principles for Telya's consumer interface.

---

## 1. Brand Identity & Principles

### The Core Promise
Moving digital dollars across wallets, networks, and agent workflows should never force users to make infrastructure decisions. Users specify **who** and **how much**; Telya resolves the recipient, explains the route, executes securely, and verifies the final outcome.

### Brand Archetype
- **High-Trust Consumer Fintech**: Clean, reassuring, and intuitive—in the league of Cash App, Wise, and Revolut.
- **AI-Native Simplicity**: Conversational input with deterministic, rock-solid financial guardrails.
- **Never a "Crypto Dashboard"**: No gas trackers, no confusing hash tables, no protocol jargon in the primary consumer flow.

### Product Principle: "Where is my money right now?"
At every point in the lifecycle, the user must understand:
1. **Before sending**: What will happen, who receives it, exact fees, and why this route was selected.
2. **While sending**: Real-time stage transitions driven by verified backend events (no fake progress bars or mock timers).
3. **After sending**: Irrefutable proof of final destination settlement.
4. **On failure**: Exactly which stage failed and how funds are recovered or held safely.

---

## 2. Color System & Design Tokens

Telya uses a high-trust, ceramic-and-ink palette paired with an authoritative emerald for settlement proof.

### Primary Palette (Light Mode — Default)

| Token Name | Hex Code | Role & Usage |
|---|---|---|
| `--canvas` | `#F6F6F8` | Main application background (soft neutral grey) |
| `--surface` | `#FFFFFF` | Primary cards, sheets, review modals, bottom bars |
| `--panel` | `#EEEFF2` | Subtle secondary container, code pills, input backgrounds |
| `--edge` | `#E3E4E8` | Micro-borders, dividers, structural frame outlines (1px solid) |
| `--heading` | `#12161E` | High-contrast title text, primary balance figures |
| `--body` | `#3B3E47` | Body copy, explanatory labels, contact descriptions |
| `--muted` | `#6F7380` | Secondary hints, timestamps, network metadata |

### Semantic & Status Colors

| Token Name | Hex Code | Role & Usage |
|---|---|---|
| `--proof` / `--success` | `#167E6C` | **Verified settlement**: Delivered, confirmed, finality reached |
| `--proof-soft` | `#E6F5F2` | Background badge for confirmed statuses |
| `--brand-navy` | `#111A4A` | Signature brand headers, wordmark, primary button fill |
| `--accent-ice` | `#C1E8EF` | Subtle highlight pills, active route preview badges |
| `--accent-blue` | `#2B64C8` | Active focus rings, interactive links, secondary CTAs |
| `--warning-amber` | `#D97706` | Approaching Agent Pass limit, confirmation pending |
| `--alert-crimson` | `#DC2626` | Revoked Agent Pass, payment failed, insufficient balance |

### Dark Mode (OLED / High-Contrast) Tokens

```css
:root[data-theme="dark"] {
  --canvas: #0A0D14;
  --surface: #121622;
  --panel: #1A2030;
  --edge: #232B3E;
  --heading: #F8FAFC;
  --body: #CBD5E1;
  --muted: #8893A8;
  --proof: #10B981;
  --proof-soft: rgba(16, 185, 129, 0.12);
  --brand-navy: #38BDF8;
  --accent-ice: rgba(193, 232, 239, 0.15);
  --accent-blue: #60A5FA;
}
```

---

## 3. Typography & Spacing System

### Font Families
- **Primary Interface**: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Numerical & Financial Data**: Inter with tabular figures:
  ```css
  font-variant-numeric: tabular-nums lining-nums;
  ```
- **Monospace (Only in Judge / Technical Inspector Mode)**: `ui-monospace, "SF Mono", Menlo, monospace`

### Typographic Hierarchy
| Role | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|
| **Hero Amount** | `36px` – `48px` | `700` (Bold) | `1.1` | `-0.03em` |
| **Section Title** | `22px` – `26px` | `600` (SemiBold) | `1.2` | `-0.02em` |
| **Card Header** | `17px` – `19px` | `600` (SemiBold) | `1.3` | `-0.01em` |
| **Body (Default)** | `15px` – `16px` | `400` / `500` | `1.5` | `0` |
| **Caption / Meta** | `12px` – `13px` | `500` (Medium) | `1.4` | `+0.01em` |

### Spacing & Border Radii
- **Base Grid**: `4px` grid (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`).
- **Corner Radii**:
  - Small elements (badges, buttons, inputs): `8px` (`--radius-sm`)
  - Cards, modals, containers: `14px` (`--radius-md`)
  - Bottom sheets, floating navigation: `20px` (`--radius-lg`)
  - Avatars & status indicators: `9999px` (Pill / Circular)

---

## 4. Voice, Tone & Microcopy Standards

Telya speaks with the confidence of a private banker and the clarity of a modern messenger.

### Golden Rules of Copy
1. **Never use crypto jargon in primary surfaces**:
   - ❌ *"Broadcasting transaction to Soroban RPC..."*
   - ✅ *"Sending 5 USDC on Stellar..."*
   - ❌ *"Submitting CCTP burn message on Base domain 6..."*
   - ✅ *"Moving funds between Base and Stellar via Circle..."*
   - ❌ *"Allowance limit exceeded on contract `CC3CE...`"*
   - ✅ *"This payment would exceed the agent's cumulative 50 USDC allowance."*
2. **Deterministic Route Explanation ("Why this route?")**:
   - Always explain choices plainly:
     - *"Direct Stellar transfer selected because @alice prefers receiving on Stellar."*
     - *"Circle cross-chain route selected because your USDC is on Base and @alice receives on Stellar."*
3. **No False Reassurance**:
   - Never say "Payment Complete" when only the source transaction succeeded. Use *"Funds in transit (verifying on Stellar...)"* until finality is verified.

---

## 5. Core UI Component Specifications

### A. The Top Shell (Navigation & Trust)
- **Left**: Minimalist wordmark `Telya.` with high-contrast dot.
- **Center / Dynamic**: Active wallet balance or quick contact carousel.
- **Right**: Unmistakable **Testnet badge** (glowing dot + `"Testnet"`) so judges and users immediately know the execution environment.

### B. The Conversational Composer
- Fixed or floating pill at the bottom of the viewport.
- Contains:
  - Clean input placeholder: *"Who do you want to pay? (e.g. Send @alice 5 USDC)"*
  - **Press-to-talk audio mic button**: Animated soundwave state when listening.
  - Action chips above composer: `Send to @alice`, `Check balances`, `Manage Agent Pass`.

### C. The Payment Review Card
Rendered before any funds move:
- Recipient identity + verified avatar + `@username`.
- Source network & Destination network.
- Transfer breakdown:
  - Amount: `5.00 USDC`
  - Network/provider fee: show the calculated value, or `Sponsored` only when sponsorship applies to the selected route
  - Total: `5.00 USDC`
- Clear explanation badge: *"Fastest & lowest cost route"*.
- Actions: **Confirm with Passkey** (primary) and **Cancel** (subtle).

### D. The Real-Stage Payment Timeline
Step tracker with active state pulses:
- **Direct Route**:
  1. `Authorized` → 2. `Submitted to Stellar` → 3. `Verified & Delivered`
- **Cross-Chain (CCTP) Route**:
  1. `Authorized` → 2. `Burned on Base` → 3. `Circle Attestation` → 4. `Minted & Verified on Stellar`
- Each step includes elapsed time and direct explorer links (Stellar Expert / BaseScan) accessible on tap.

### E. Agent Pass Card
- Styled like an elegant digital membership card or allowance ticket.
- Visual elements:
  - Agent Name / Purpose (e.g., *"Subscription Agent"*).
  - Cumulative spending progress bar (`12.50 / 50.00 USDC`).
  - On-chain expiration ledger, with a derived approximate time only when current ledger data is available.
  - Passkey-authorized **"Revoke Pass"** destructive button.

---

## 6. Judge / Testnet Mode Indicator
A persistent, subtle pill or toggle in the footer/header:
- Allows judges to inspect raw transaction hashes, Soroban contract addresses, and event logs on demand without cluttering the consumer experience.
- Pre-populated test contacts: `@alice` (Stellar recipient), `@bob` (Base recipient).
