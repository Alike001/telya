# Hammed Ali Oyeleye — Handoff

Read:
- `../product/PRD.md`
- `../product/ARCHITECTURE.md`
- `../product/ACCEPTANCE-TESTS.md`

## Own

- Stellar Smart Account Kit.
- Passkey account ownership.
- Stellar USDC.
- Fee sponsorship.
- Direct Stellar transfers.
- Agent Pass.
- Stellar side of CCTP.
- Settlement verification.
- Testnet/Mainnet config.
- Integration acceptance.
- Deployment/submission readiness.

## Preserve the validated Agent Pass behavior

The prior Testnet spike proved:
- agent signer can spend within allowance,
- cumulative spending over allowance is rejected,
- owner can revoke,
- agent cannot spend after revocation,
- owner remains in control.

Integrate that pattern into Telya instead of redesigning it from scratch.

## Do not

- take over the entire frontend,
- take over the full AI/backend workload,
- expose sponsor secrets in client code,
- mark source confirmation as cross-chain completion.
