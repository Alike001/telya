import {
  IndexedDBStorage,
  SmartAccountKit,
  type ConnectWalletResult,
  type CreateWalletResult,
  type TransactionResult,
} from "smart-account-kit";
import { Networks, StrKey } from "@stellar/stellar-sdk";

const TelyaSmartAccount = {
  appName: "Telya",
  storageName: "telya-smart-account",
} as const;

/**
 * Browser-safe Smart Account Kit configuration. This deliberately has no
 * deployer or sponsor secret field: Telya submits through a server relayer.
 */
export interface SmartAccountPublicConfig {
  readonly rpcUrl: string;
  readonly networkPassphrase: string;
  readonly accountWasmHash: string;
  readonly webauthnVerifierAddress: string;
  readonly usdcContract: string;
  readonly relayerUrl: string;
  readonly rpId?: string;
  readonly allowedOrigins?: readonly string[];
}

export interface ConnectedSmartAccount {
  readonly contractId: string;
  readonly credentialId: string;
  readonly deploymentTransactionHash?: string;
}

export interface SmartAccountLifecycleKit {
  readonly isConnected: boolean;
  readonly contractId: string | undefined;
  readonly credentialId: string | undefined;
  createWallet(
    appName: string,
    userName: string,
    options: { autoSubmit: true; forceMethod: "relayer" },
  ): Promise<
    CreateWalletResult & {
      submitResult?: TransactionResult;
    }
  >;
  connectWallet(options?: {
    prompt?: boolean;
    fresh?: boolean;
  }): Promise<ConnectWalletResult | null>;
  disconnect(): Promise<void>;
}

export class SmartAccountLifecycleError extends Error {
  readonly code:
    | "INVALID_PUBLIC_CONFIG"
    | "DEPLOYMENT_FAILED"
    | "CONNECTION_INCOMPLETE";

  constructor(
    code: SmartAccountLifecycleError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SmartAccountLifecycleError";
    this.code = code;
  }
}

function requirePublicValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new SmartAccountLifecycleError(
      "INVALID_PUBLIC_CONFIG",
      `${label} is required`,
    );
  }
  return normalized;
}

export function validateSmartAccountPublicConfig(
  config: SmartAccountPublicConfig,
): SmartAccountPublicConfig {
  if (config.networkPassphrase !== Networks.TESTNET) {
    throw new SmartAccountLifecycleError(
      "INVALID_PUBLIC_CONFIG",
      "Telya wallet onboarding is restricted to Stellar Testnet",
    );
  }

  let rpcUrl: URL;
  try {
    rpcUrl = new URL(requirePublicValue(config.rpcUrl, "rpcUrl"));
  } catch {
    throw new SmartAccountLifecycleError(
      "INVALID_PUBLIC_CONFIG",
      "rpcUrl must be a valid URL",
    );
  }
  if (rpcUrl.protocol !== "https:" || rpcUrl.username || rpcUrl.password) {
    throw new SmartAccountLifecycleError(
      "INVALID_PUBLIC_CONFIG",
      "rpcUrl must be a credential-free HTTPS URL",
    );
  }
  const accountWasmHash = requirePublicValue(
    config.accountWasmHash,
    "accountWasmHash",
  ).toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(accountWasmHash)) {
    throw new SmartAccountLifecycleError(
      "INVALID_PUBLIC_CONFIG",
      "accountWasmHash must be a 32-byte hexadecimal hash",
    );
  }

  const webauthnVerifierAddress = requirePublicValue(
    config.webauthnVerifierAddress,
    "webauthnVerifierAddress",
  );

  if (!StrKey.isValidContract(webauthnVerifierAddress)) {
    throw new SmartAccountLifecycleError(
      "INVALID_PUBLIC_CONFIG",
      "webauthnVerifierAddress must be a valid Stellar contract address",
    );
  }

  const usdcContract = requirePublicValue(config.usdcContract, "usdcContract");
  if (!StrKey.isValidContract(usdcContract)) {
    throw new SmartAccountLifecycleError(
      "INVALID_PUBLIC_CONFIG",
      "usdcContract must be a valid Stellar contract address",
    );
  }

  const allowedOrigins = config.allowedOrigins?.map((origin) =>
    requirePublicValue(origin, "allowedOrigins entry"),
  );

  return {
    rpcUrl: rpcUrl.toString().replace(/\/$/, ""),
    networkPassphrase: requirePublicValue(
      config.networkPassphrase,
      "networkPassphrase",
    ),
    accountWasmHash,
    webauthnVerifierAddress,
    usdcContract,
    relayerUrl: requirePublicValue(config.relayerUrl, "relayerUrl"),
    ...(config.rpId
      ? { rpId: requirePublicValue(config.rpId, "rpId") }
      : {}),
    ...(allowedOrigins ? { allowedOrigins } : {}),
  };
}

export function createBrowserSmartAccountKit(
  rawConfig: SmartAccountPublicConfig,
): SmartAccountKit {
  const config = validateSmartAccountPublicConfig(rawConfig);
  const { allowedOrigins, usdcContract: _usdcContract, ...baseConfig } = config;
  void _usdcContract;

  return new SmartAccountKit({
    ...baseConfig,
    ...(allowedOrigins ? { allowedOrigins: [...allowedOrigins] } : {}),
    acceptedWasmHashes: [config.accountWasmHash],
    acceptedBirthWasmHashes: [config.accountWasmHash],
    rpName: TelyaSmartAccount.appName,
    storage: new IndexedDBStorage(TelyaSmartAccount.storageName),
  });
}

function accountFromResult(
  result: ConnectWalletResult | CreateWalletResult,
): ConnectedSmartAccount {
  return {
    contractId: result.contractId,
    credentialId: result.credentialId,
  };
}

/** Silently restores the last verified session after a browser refresh. */
export async function restoreSmartAccount(
  kit: SmartAccountLifecycleKit,
): Promise<ConnectedSmartAccount | null> {
  const result = await kit.connectWallet();
  return result ? accountFromResult(result) : null;
}

/**
 * Prompts for an existing passkey when no local session exists. The SDK uses
 * its indexer for discovery and verifies ownership on-chain before connecting.
 */
export async function connectSmartAccount(
  kit: SmartAccountLifecycleKit,
): Promise<ConnectedSmartAccount> {
  const result = await kit.connectWallet({ prompt: true });
  if (!result) {
    throw new SmartAccountLifecycleError(
      "CONNECTION_INCOMPLETE",
      "No verified Stellar smart account was connected",
    );
  }
  return accountFromResult(result);
}

/** Creates and submits a passkey-owned account through the configured relayer. */
export async function createSmartAccount(
  kit: SmartAccountLifecycleKit,
  username: string,
): Promise<ConnectedSmartAccount> {
  const normalizedUsername = requirePublicValue(username, "username");
  const result = await kit.createWallet(
    TelyaSmartAccount.appName,
    normalizedUsername,
    {
      autoSubmit: true,
      forceMethod: "relayer",
    },
  );

  if (!result.submitResult?.success) {
    const cause = result.submitResult?.error;
    throw new SmartAccountLifecycleError(
      "DEPLOYMENT_FAILED",
      cause?.message ?? "Stellar smart-account deployment did not complete",
      cause ? { cause } : undefined,
    );
  }

  if (!kit.isConnected) {
    throw new SmartAccountLifecycleError(
      "CONNECTION_INCOMPLETE",
      "The Stellar smart account deployed but was not connected",
    );
  }

  return {
    ...accountFromResult(result),
    ...(result.submitResult.hash
      ? { deploymentTransactionHash: result.submitResult.hash }
      : {}),
  };
}

export async function disconnectSmartAccount(
  kit: SmartAccountLifecycleKit,
): Promise<void> {
  await kit.disconnect();
}
