import { Networks } from "@stellar/stellar-sdk";

import {
  validateSmartAccountPublicConfig,
  type SmartAccountPublicConfig,
} from "./smart-account";

export function smartAccountPublicConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): SmartAccountPublicConfig {
  return validateSmartAccountPublicConfig({
    rpcUrl: environment.STELLAR_RPC_URL ?? "",
    networkPassphrase:
      environment.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET,
    accountWasmHash: environment.STELLAR_ACCOUNT_WASM_HASH ?? "",
    webauthnVerifierAddress: environment.STELLAR_WEBAUTHN_VERIFIER ?? "",
    ed25519VerifierAddress: environment.STELLAR_ED25519_VERIFIER ?? "",
    spendingLimitPolicyAddress:
      environment.STELLAR_SPENDING_LIMIT_POLICY ?? "",
    usdcContract: environment.STELLAR_USDC_SAC ?? "",
    // Deployment sponsorship is deliberately fixed to the authenticated,
    // one-use same-origin handoff. Environment configuration cannot redirect
    // passkey deployment payloads to the generic or a third-party relayer.
    relayerUrl: "/api/stellar/relayer/deployment",
    ...(environment.STELLAR_WEBAUTHN_RP_ID
      ? { rpId: environment.STELLAR_WEBAUTHN_RP_ID }
      : {}),
    ...(environment.STELLAR_WEBAUTHN_ALLOWED_ORIGINS
      ? {
          allowedOrigins: environment.STELLAR_WEBAUTHN_ALLOWED_ORIGINS.split(",")
            .map((origin) => origin.trim())
            .filter(Boolean),
        }
      : {}),
  });
}
