export {
  SmartAccountLifecycleError,
  connectSmartAccount,
  createBrowserSmartAccountKit,
  createSmartAccount,
  disconnectSmartAccount,
  restoreSmartAccount,
  validateSmartAccountPublicConfig,
} from "./smart-account";

export type {
  ConnectedSmartAccount,
  SmartAccountLifecycleKit,
  SmartAccountPublicConfig,
} from "./smart-account";

export {
  STELLAR_USDC_DECIMALS,
  StellarUsdcValidationError,
  normalizeStellarUsdcAmount,
  stellarUsdcAmountFromRawUnits,
  submitStellarUsdcTransfer,
  verifyStellarUsdcTransfer,
} from "./usdc";

export {
  AGENT_PASS_DURATION_LEDGERS,
  OWNER_CONTEXT_RULE_ID,
  AgentPassError,
  createStellarAgentPass,
  getAgentPassSpending,
  revokeStellarAgentPass,
  submitAgentPassTransfer,
} from "./agent-pass";

export type { ActiveAgentPass, AgentPassSpending } from "./agent-pass";

export type {
  StellarRpcServer,
  StellarTransactionRpc,
  StellarUsdcSubmission,
  StellarUsdcTransferKit,
  StellarUsdcVerification,
} from "./usdc";
