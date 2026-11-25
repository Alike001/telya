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

export type {
  StellarRpcServer,
  StellarTransactionRpc,
  StellarUsdcSubmission,
  StellarUsdcTransferKit,
  StellarUsdcVerification,
} from "./usdc";
