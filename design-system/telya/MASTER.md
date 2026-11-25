# Telya Master Design System: High-Trust Consumer Fintech

> **Visual Source of Truth**: These tokens and component rules remain subordinate to Telya's product, architecture, decision, and acceptance-test documents. The direction synthesizes patterns from **Wise** (transparency & tracking), **Family** (delightful crypto & passkey onboarding), **Linear & Raycast** (keyboard precision & micro-interactions), **Talise** (handle-based money movement & on-chain Agent Passes), and **CowryPay** (conversational AI automation scheme).

---

## 1. Executive Design Philosophy

### The "Where is my money right now?" Invariant
Every visual component, transition, and microcopy string exists to answer this single question with zero ambiguity:
1. **Pre-Flight**: Crystal-clear recipient resolution, route explanation, exact fees, and recipient amount.
2. **In-Flight**: Real-time state transitions driven exclusively by verified backend events (no fake timers or optimistic completion).
3. **Post-Flight**: Cryptographic proof of destination finality (verifying recipient and amount).
4. **Failsafe**: Explicit stage-level failure notification with clear recovery actions.

### Brand Aesthetic: "Ceramic & Ink with Authoritative Emerald"
Telya blends the warmth and human simplicity of **Wise** and **Family** with the technical precision of **Linear**:
- **Light Mode (Default)**: Ceramic white surfaces (`#FFFFFF`) sitting on soft architectural canvas (`#F6F6F8`), framed by crisp micro-borders (`#E3E4E8`) and anchored by deep midnight navy typography (`#111A4A`).
- **Dark Mode (OLED Precision)**: Deep cosmic canvas (`#0A0D14`), obsidian card surfaces (`#121622`), hairline borders (`#232B3E`), and high-readability text (`#F8FAFC`).
- **Proof & Trust Emerald**: `#167E6C` (Light) / `#10B981` (Dark) — reserved exclusively for verified settlement and cryptographically proven states.

---

## 2. Global Tokens & Palette

### CSS Variables Root

```css
:root {
  /* Canvas & Surfaces */
  --canvas: #F6F6F8;
  --surface: rgba(255, 255, 255, 0.88);
  --surface-solid: #FFFFFF;
  --panel: #EEEFF2;
  --panel-hover: #E7E8ED;
  --edge: #E3E4E8;
  --edge-subtle: #ECEEF2;
  --edge-focus: #2B64C8;

  /* Typography Colors */
  --heading: #12161E;
  --navy: #111A4A;
  --body: #3B3E47;
  --muted: #6F7380;
  --muted-light: #9499A8;

  /* Trust & Semantic Accents */
  --proof: #167E6C;
  --proof-bg: #E6F5F2;
  --proof-border: #99D5C9;
  --ice: #C1E8EF;
  --ice-bg: rgba(193, 232, 239, 0.25);
  --warning: #D97706;
  --warning-bg: #FEF3C7;
  --alert: #DC2626;
  --alert-bg: #FEE2E2;

  /* Elevation Shadows */
  --shadow-sm: 0 1px 2px rgba(18, 22, 30, 0.04);
  --shadow-md: 0 4px 12px rgba(18, 22, 30, 0.06);
  --shadow-lg: 0 12px 32px rgba(18, 22, 30, 0.08);
  --shadow-xl: 0 24px 48px rgba(18, 22, 30, 0.12);

  /* Corner Radii (Family & Linear Inspired) */
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-pill: 9999px;

  /* Layout Shell */
  --shell: 1120px;
  --composer-width: 680px;
}

[data-theme="dark"] {
  --canvas: #0A0D14;
  --surface: rgba(18, 22, 34, 0.85);
  --surface-solid: #121622;
  --panel: #1A2030;
  --panel-hover: #222B3F;
  --edge: #232B3E;
  --edge-subtle: #1C2333;
  --heading: #F8FAFC;
  --navy: #38BDF8;
  --body: #CBD5E1;
  --muted: #8893A8;
  --proof: #10B981;
  --proof-bg: rgba(16, 185, 129, 0.12);
  --proof-border: rgba(16, 185, 129, 0.25);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 16px 36px rgba(0, 0, 0, 0.6);
}
```

---

## 3. Typography & Numerical Precision

- **Primary Interface**: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Financial Figures**: `font-variant-numeric: tabular-nums lining-nums;` — ensures numbers never shift or jiggle during real-time balance updates or counter animations.
- **Inspector / Judge Mode**: `ui-monospace, "SF Mono", Menlo, Consolas, monospace` — strictly confined to technical inspection overlays and hash proof pills.

---

## 4. Inspiration Synthesis Matrix

| Source | Core UI / UX Borrowing | How Telya Implements It |
|---|---|---|
| **Family** (`family.co`) | Passkey onboarding, warm frosted cards, zero seed-phrase jargon | TouchID/FaceID passkey signup into Stellar Smart Account Kit. One-tap `@username` claiming. |
| **Wise** (`wise.com`) | Guaranteed fee breakdown, "You send / Recipient gets", stage tracker | Exact recipient payout principle (recipient gets exactly what was asked; network fees sponsored or broken out). Multi-stage verified timeline. |
| **Linear** (`linear.app`) | Keyboard shortcuts, command speed, precision border system | Quick command palette, action chips, instant keyboard focus (`Cmd+K` / `/`), subtle 1px border tokens. |
| **Raycast** (`raycast.com`) | Conversational intent with action pills | Quick actions (`Send @alice 5 USDC`, `Check balance`, `Revoke Agent Pass`). |
| **Talise** (`talise.io`) | Handle-based payments & on-chain Agent Passes | Send money to `@username` as simply as sending a message. On-chain Agent Pass allowances with cumulative limits, expiry, and owner-authorized revocation. |
| **CowryPay** (`cowrypay.xyz`) | "Talk-to-Pay" conversational AI automation flow | Natural language input (voice/text) -> Structured intent -> Deterministic route validation -> User passkey confirmation -> Event-driven progress. |

---

## 5. Non-Negotiable UX & Engineering Guardrails

1. **No Emojis as UI Icons**: Always use crisp, fixed viewBox (24x24) SVGs from Lucide or Heroicons.
2. **Bounded Financial Authorization**: The AI may draft intent but NEVER signs transactions or accesses keys. Owner-controlled payments require explicit passkey approval. Agent Pass payments use a separately held agent signer and must remain within the on-chain direct-Stellar-USDC rule, cumulative limit, and expiry; they do not require a new owner passkey prompt per payment.
3. **Zero Fake Progress**: Never simulate a timer or fake success. The payment stage must reflect confirmed on-chain or Circle CCTP attestations.
4. **All Interactive Elements**: Must have `cursor: pointer;`, active states, and focus rings conforming to WCAG 2.1 AA.
5. **Jargon-Free by Default**: Hide RPCs, Soroban contract hashes, domain IDs, and gas limits behind an optional "Inspect / Judge Mode" toggle.
