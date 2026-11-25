# Page Override: Transaction Timeline & Verified Receipts

> **Inspiration Source**: **Wise Web Onboarding & Tracking** (unmistakable step-by-step progress) + **Family** (crystal-clear transaction details) + **Telya Core Invariant** ("Where is my money right now?").

---

## 1. Real-State Payment Progression (No Fake Progress)

In compliance with Telya architectural rules, the timeline is driven strictly by backend-verified state transitions. We never fake a timer or show an optimistic completion checkmark.

### A. Direct Stellar Route (`Stellar -> Stellar USDC`)
```
[●] 1. Authorized by owner passkey or active Agent Pass
 └── [●] 2. Submitted to Stellar Network
      └── [●] 3. Recipient and amount verified — FINAL
```

### B. Cross-Chain Circle CCTP Route (`Base -> Stellar USDC`)
```
[●] 1. Authorized with Passkey
 └── [●] 2. Burn Confirmed on Base (BaseScan tx proof)
      └── [●] 3. Circle Attestation In Flight (show a provider estimate only when available)
           └── [●] 4. Mint Submitted to Stellar (Stellar Expert tx proof)
                └── [●] 5. Destination Verified: 5.00 USDC delivered to @alice — FINAL
```

> [!IMPORTANT]
> Stage 2 ("Burn Confirmed on Base") is **NEVER** marked as payment complete. The UI displays *"Funds in transit across Circle CCTP..."* until Stage 5 is cryptographically verified on Stellar.

---

## 2. Timeline Step Component Design (Wise Pattern)

Each step in the vertical timeline contains:
1. **Indicator Node**:
   - `Completed`: Solid emerald circle with white SVG checkmark.
   - `In-Progress`: White circle with pulsing emerald border (`box-shadow: 0 0 0 4px var(--proof-bg)`).
   - `Pending`: Subtle grey dot.
   - `Failed`: Crimson circle with exclamation mark.
2. **Step Title**: High-contrast label (e.g. *"Circle Attestation Confirmed"*).
3. **Step Meta**: Timestamp, duration, and optional technical proof link (*"View BaseScan"*, *"View Stellar Expert"*).

---

## 3. Verified Settlement Receipt (Family + Wise Inspired)

Once destination finality is confirmed:
- The active timeline collapses or folds into a permanent, sharable **Verified Receipt Card**:
  - Green check banner: **"Delivered & Verified"**
  - Recipient: `@alice` (with avatar & verified badge)
  - Amount Received: `5.00 USDC`
  - Total Paid: `5.00 USDC` (Zero fee)
  - Time of Settlement: `Nov 25, 2026 · 11:42 AM`
  - Route: `Base → Stellar (Circle CCTP)`
  - Verification Hash: Shortened cryptographic hash with copy button and external explorer link.
  - Action: **"Done"** or **"Share Receipt"**.
