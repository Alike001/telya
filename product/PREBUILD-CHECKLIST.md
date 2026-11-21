# Telya Pre-Build-Week Readiness Checklist

Use this checklist before substantive implementation begins.

## 1. Build Week boundary and submission readiness

Team Bravo has voluntarily chosen **November 25, 2026** as the start of substantive Telya feature implementation.

Before then:
- [ ] Confirm final submission deadline and required submission format when organizers publish/clarify it.
- [ ] Confirm judging criteria if a detailed rubric exists.
- [ ] Confirm any mandatory public-repository, video, demo, or showcase requirements.
- [ ] Record confirmed organizer answers in `product/DECISIONS.md`.

No feature coding is required before November 25.

## 2. Team access

- [x] Hammed (@Alike001) owns repository/admin access.
- [x] Webghost (@Webghost01-NG) has collaborator access.
- [ ] Prudent (@Prudentdev-xyz) accepts collaborator invitation.
- [ ] All three can clone, create branches, push, and open PRs.
- [ ] Each teammate reads their role-specific handoff.
- [ ] Each teammate's coding agent reads `AGENTS.md` + `handoffs/AGENT-HANDOFF.md`.

## 3. Problem validation

Formal target-user interviews are **optional, not a Build Week blocker**.

Telya will proceed from:
- the submitted Buildathon problem statement,
- current Stellar ecosystem capabilities,
- the validated Agent Pass spike,
- the consumer-first product thesis already documented in the PRD.

If user feedback becomes easy to obtain later, record it as supporting evidence. Do not delay Build Week implementation for it.

## 4. Competitive differentiation

Telya must not present itself as merely:
- another wallet,
- another bridge UI,
- another payment handle,
- another chatbot.

The P0 thesis is:
- one conversational interface,
- deterministic routing across Stellar and Base,
- visible finality and route reasoning,
- exact recipient verification,
- Stellar passkey smart account,
- limited/revocable Agent Pass,
- fiat-ramp path.

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
- [ ] Stellar Testnet USDC configuration verified.
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

Primary 30-second story:

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
