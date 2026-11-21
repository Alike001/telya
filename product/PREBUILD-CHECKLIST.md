# Telya Pre-Build-Week Readiness Checklist

Use this checklist before substantive implementation begins.

## 1. Rules and organizer confirmation

- [ ] Confirm whether substantive feature implementation is allowed before November 25.
- [ ] Confirm final submission deadline and required submission format.
- [ ] Confirm judging criteria if a detailed rubric exists.
- [ ] Confirm whether every teammate must separately submit the main Buildathon form or only the team representative.
- [ ] Confirm any restrictions on pre-existing code, libraries, templates, or prior prototypes.
- [ ] Confirm whether public repositories are required by submission time.

Record organizer answers in `product/DECISIONS.md`.

## 2. Team access

- [x] Hammed (@Alike001) owns repository/admin access.
- [x] Webghost (@Webghost01-NG) has collaborator access.
- [ ] Prudent (@Prudentdev-xyz) accepts collaborator invitation.
- [ ] All three can clone, create branches, push, and open PRs.
- [ ] Each teammate reads their role-specific handoff.
- [ ] Each teammate's coding agent reads `AGENTS.md` + `handoffs/AGENT-HANDOFF.md`.

## 3. Problem validation

Before Build Week, talk to at least 5 target users:
- freelancer / remote worker,
- small business owner,
- stablecoin user,
- crypto-native user who has bridged before,
- non-crypto user who receives international payments.

Ask:
1. How do you currently receive/send digital dollars?
2. What is the most confusing part?
3. Have you ever sent to the wrong network/address?
4. Do gas tokens/bridges stop or delay you?
5. Would you prefer saying what you want and reviewing a route before execution?
6. Would visible payment progress make you trust a cross-chain transfer more?
7. Would you allow an AI agent to spend if you could set a hard limit and revoke it instantly?
8. What would stop you from using this product?

Do not pitch first. Listen for repeated pain.

## 4. Competitive differentiation

Document how Telya differs from:
- ordinary wallets,
- bridge UIs,
- payment-handle products,
- remittance apps,
- autonomous agent wallets.

Telya's current differentiation hypothesis:
- one conversational interface,
- deterministic routing across Stellar and Base,
- visible finality and route reasoning,
- exact recipient verification,
- Stellar passkey smart account,
- limited/revocable Agent Pass,
- fiat-ramp path.

Validate this rather than assuming it is enough.

## 5. Provider readiness

Prepare accounts/access without shipping product features:

- [ ] Vercel account/project ready.
- [ ] Neon account/project ready.
- [ ] Privy app/account evaluated and credentials ready if selected.
- [ ] Gemini API free-tier access ready.
- [ ] Groq API free-tier access ready.
- [ ] Circle CCTP Testnet docs/contracts verified.
- [ ] Base Sepolia test ETH available.
- [ ] Base Sepolia USDC source identified.
- [ ] Stellar Testnet accounts/funding ready.
- [ ] Stellar Testnet USDC contract/asset configuration verified.
- [ ] MoneyGram sandbox access requested/confirmed.
- [ ] No production/mainnet secrets are required for Build Week.

## 6. Local developer readiness

Each teammate:
- [ ] Node/runtime version installed.
- [ ] Git/GitHub authentication works.
- [ ] Can clone Telya.
- [ ] Can create branch + PR.
- [ ] Required Stellar CLI/Rust toolchain installed for Stellar owner.
- [ ] Environment template understood.
- [ ] No secrets committed.

## 7. Demo readiness before coding

Agree on one primary 30-second story:

1. User asks to send USDC.
2. Telya resolves source/destination.
3. Telya explains the route.
4. User confirms.
5. User watches real payment progress.
6. Recipient/finality is verified.
7. Receipt appears.
8. Agent Pass is shown as the safety differentiator.

Everything built should strengthen this story.

## 8. Scope protection

Before accepting any new feature ask:
- Does it solve the core user problem?
- Does a judge need it to understand Telya?
- Is it required by Stellar/provider integration?
- Does it improve reliability or trust?

If no, put it in `product/ROADMAP.md`.
