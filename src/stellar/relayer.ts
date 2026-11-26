import {
  Account,
  Address,
  BASE_FEE,
  hash,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { rpc } from "@stellar/stellar-sdk";

const SHARED_DEPLOYER = Keypair.fromRawEd25519Seed(
  hash(Buffer.from("openzeppelin-smart-account-kit")),
).publicKey();

const MAX_REQUEST_BYTES = 48_000;
const DEFAULT_MAX_RESOURCE_FEE_STROOPS = 1_000_000n;

export class StellarRelayerError extends Error {
  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "FORBIDDEN_DEPLOYMENT"
      | "FEE_LIMIT_EXCEEDED"
      | "RELAYER_UNAVAILABLE"
      | "SUBMISSION_FAILED"
      | "PAYMENT_MISMATCH",
    message: string,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StellarRelayerError";
  }
}

export interface StellarDeploymentSubmission {
  readonly func: string;
  readonly auth: readonly string[];
  readonly paymentId?: string;
}

export interface ValidatedStellarDeployment {
  readonly kind: "deployment";
  readonly func: xdr.HostFunction;
  readonly auth: readonly xdr.SorobanAuthorizationEntry[];
}

export interface ValidatedStellarUsdcTransfer {
  readonly kind: "usdc_transfer";
  readonly func: xdr.HostFunction;
  readonly auth: readonly xdr.SorobanAuthorizationEntry[];
  readonly tokenContract: string;
  readonly sender: string;
  readonly recipient: string;
  readonly amountRaw: bigint;
  readonly authorizationKind: "owner" | "agent";
  readonly contextRuleId: number;
  readonly signerAddress: string;
}

export interface ValidatedStellarAgentPassCreate {
  readonly kind: "agent_pass_create";
  readonly func: xdr.HostFunction;
  readonly auth: readonly xdr.SorobanAuthorizationEntry[];
  readonly smartAccount: string;
  readonly agentAddress: string;
  readonly agentPublicKey: string;
  readonly tokenContract: string;
  readonly spendingLimitPolicy: string;
  readonly spendingLimitRaw: bigint;
  readonly periodLedgers: number;
  readonly validUntilLedger: number;
}

export interface ValidatedStellarAgentPassRevoke {
  readonly kind: "agent_pass_revoke";
  readonly func: xdr.HostFunction;
  readonly auth: readonly xdr.SorobanAuthorizationEntry[];
  readonly smartAccount: string;
  readonly contextRuleId: number;
}

export type ValidatedStellarRelayerSubmission =
  | ValidatedStellarDeployment
  | ValidatedStellarUsdcTransfer
  | ValidatedStellarAgentPassCreate
  | ValidatedStellarAgentPassRevoke;

interface SmartAccountAuthorization {
  readonly contextRuleId: number;
  readonly verifierAddress: string;
  readonly keyData: Buffer;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function contractIdOf(address: xdr.ScAddress, message: string): string {
  if (address.switch().name !== "scAddressTypeContract") {
    throw new StellarRelayerError("FORBIDDEN_DEPLOYMENT", message, 403);
  }
  return Address.fromScAddress(address).toString();
}

function addressOf(address: xdr.ScAddress, message: string): string {
  const type = address.switch().name;
  if (type !== "scAddressTypeAccount" && type !== "scAddressTypeContract") {
    throw new StellarRelayerError("FORBIDDEN_DEPLOYMENT", message, 403);
  }
  return Address.fromScAddress(address).toString();
}

function validateConstructor(
  deploy: xdr.CreateContractArgsV2,
  webauthnVerifierAddress: string,
): void {
  const args = deploy.constructorArgs();
  if (
    args.length !== 2 ||
    args[0]?.switch().name !== "scvVec" ||
    args[1]?.switch().name !== "scvMap"
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy constructor has an invalid argument shape",
      403,
    );
  }

  const signers = args[0].vec() ?? [];
  const signer = signers[0]?.switch().name === "scvVec" ? signers[0].vec() ?? [] : [];
  if (
    signers.length !== 1 ||
    signer.length !== 3 ||
    signer[0]?.switch().name !== "scvSymbol" ||
    signer[0].sym().toString() !== "External" ||
    signer[1]?.switch().name !== "scvAddress" ||
    signer[2]?.switch().name !== "scvBytes"
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy must contain exactly one WebAuthn signer",
      403,
    );
  }

  const verifier = contractIdOf(
    signer[1].address(),
    "Deploy signer verifier must be a contract",
  );
  if (verifier !== webauthnVerifierAddress) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy signer verifier is not allowlisted",
      403,
    );
  }

  const keyData = signer[2].bytes();
  if (keyData.length <= 65 || keyData[0] !== 0x04) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy signer has invalid WebAuthn key data",
      403,
    );
  }
  const salt = deploy.contractIdPreimage().fromAddress().salt();
  if (!bytesEqual(hash(keyData.subarray(65)), salt)) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy salt does not match the passkey credential",
      403,
    );
  }

  for (const entry of args[1].map() ?? []) {
    if (entry.key().switch().name !== "scvAddress") {
      throw new StellarRelayerError(
        "FORBIDDEN_DEPLOYMENT",
        "Deploy policy key must be a contract address",
        403,
      );
    }
    contractIdOf(entry.key().address(), "Deploy policy key must be a contract address");
  }
}

export function validateStellarDeploymentSubmission(
  submission: StellarDeploymentSubmission,
  options: { accountWasmHash: string; webauthnVerifierAddress: string },
): ValidatedStellarDeployment {
  let func: xdr.HostFunction;
  let auth: xdr.SorobanAuthorizationEntry[];
  try {
    func = xdr.HostFunction.fromXDR(submission.func, "base64");
    auth = submission.auth.map((entry) =>
      xdr.SorobanAuthorizationEntry.fromXDR(entry, "base64"),
    );
  } catch {
    throw new StellarRelayerError(
      "INVALID_REQUEST",
      "func/auth contains invalid XDR",
      400,
    );
  }

  if (func.switch().name !== "hostFunctionTypeCreateContractV2") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Only smart-account deployments are accepted by this endpoint",
      403,
    );
  }
  if (auth.length !== 1) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy must contain exactly one authorization entry",
      403,
    );
  }

  const deploy = func.createContractV2();
  const executable = deploy.executable();
  if (
    executable.switch().name !== "contractExecutableWasm" ||
    Buffer.from(executable.wasmHash()).toString("hex") !== options.accountWasmHash
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy WASM hash is not allowlisted",
      403,
    );
  }

  const preimage = deploy.contractIdPreimage();
  if (preimage.switch().name !== "contractIdPreimageFromAddress") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy must use an address preimage",
      403,
    );
  }
  const deployer = addressOf(
    preimage.fromAddress().address(),
    "Deploy preimage address is invalid",
  );
  if (deployer !== SHARED_DEPLOYER) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy preimage address is not allowlisted",
      403,
    );
  }

  validateConstructor(deploy, options.webauthnVerifierAddress);

  const entry = auth[0];
  if (!entry || entry.credentials().switch().name !== "sorobanCredentialsAddress") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy requires address credentials",
      403,
    );
  }
  const signer = addressOf(
    entry.credentials().address().address(),
    "Deploy credential address is invalid",
  );
  const root = entry.rootInvocation();
  const rootFunction = root.function();
  if (
    signer !== deployer ||
    root.subInvocations().length !== 0 ||
    rootFunction.switch().name !==
      "sorobanAuthorizedFunctionTypeCreateContractV2HostFn" ||
    !bytesEqual(rootFunction.createContractV2HostFn().toXDR(), deploy.toXDR())
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy authorization does not exactly match the deployment",
      403,
    );
  }

  return { kind: "deployment", func, auth };
}

function requireTransferAddress(value: xdr.ScVal, label: string): string {
  if (value.switch().name !== "scvAddress") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      `${label} must be a Stellar address`,
      403,
    );
  }
  return addressOf(value.address(), `${label} must be a Stellar address`);
}

function requireSmartAccountAuthorization(
  entry: xdr.SorobanAuthorizationEntry,
  invoke: xdr.InvokeContractArgs,
  expectedAccount: string,
): SmartAccountAuthorization {
  if (entry.credentials().switch().name !== "sorobanCredentialsAddress") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Operation requires smart-account address credentials",
      403,
    );
  }
  const credentials = entry.credentials().address();
  const credentialAddress = addressOf(
    credentials.address(),
    "Operation credential address is invalid",
  );
  const root = entry.rootInvocation();
  const rootFunction = root.function();
  if (
    credentialAddress !== expectedAccount ||
    credentials.signatureExpirationLedger() <= 0 ||
    root.subInvocations().length !== 0 ||
    rootFunction.switch().name !== "sorobanAuthorizedFunctionTypeContractFn" ||
    !bytesEqual(rootFunction.contractFn().toXDR(), invoke.toXDR())
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Operation authorization does not exactly match the invocation",
      403,
    );
  }

  const signature = credentials.signature();
  if (signature.switch().name !== "scvMap") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Operation authorization payload is invalid",
      403,
    );
  }
  let contextRuleIds: readonly xdr.ScVal[] | undefined;
  let signers: readonly xdr.ScMapEntry[] | undefined;
  for (const item of signature.map() ?? []) {
    if (item.key().switch().name !== "scvSymbol") continue;
    const field = item.key().sym().toString();
    if (field === "context_rule_ids" && item.val().switch().name === "scvVec") {
      contextRuleIds = item.val().vec() ?? [];
    }
    if (field === "signers" && item.val().switch().name === "scvMap") {
      signers = item.val().map() ?? [];
    }
  }
  if (
    contextRuleIds?.length !== 1 ||
    contextRuleIds[0]?.switch().name !== "scvU32" ||
    signers?.length !== 1
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Operation must use exactly one context rule and signer",
      403,
    );
  }
  const signer = signers[0]!;
  const encodedSigner = signer.key();
  const signerParts =
    encodedSigner.switch().name === "scvVec" ? encodedSigner.vec() ?? [] : [];
  if (
    signerParts.length !== 3 ||
    signerParts[0]?.switch().name !== "scvSymbol" ||
    signerParts[0].sym().toString() !== "External" ||
    signerParts[1]?.switch().name !== "scvAddress" ||
    signerParts[2]?.switch().name !== "scvBytes" ||
    signer.val().switch().name !== "scvBytes" ||
    signer.val().bytes().length === 0
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Operation signer payload is invalid",
      403,
    );
  }
  return {
    contextRuleId: contextRuleIds[0].u32(),
    verifierAddress: contractIdOf(
      signerParts[1].address(),
      "Operation signer verifier must be a contract",
    ),
    keyData: Buffer.from(signerParts[2].bytes()),
  };
}

function requireOwnerAuthorization(
  entry: xdr.SorobanAuthorizationEntry,
  invoke: xdr.InvokeContractArgs,
  smartAccount: string,
  webauthnVerifierAddress: string,
): void {
  const authorization = requireSmartAccountAuthorization(
    entry,
    invoke,
    smartAccount,
  );
  if (
    authorization.contextRuleId !== 0 ||
    authorization.verifierAddress !== webauthnVerifierAddress ||
    authorization.keyData.length <= 65 ||
    authorization.keyData[0] !== 0x04
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Agent Pass administration requires the passkey owner",
      403,
    );
  }
}

function requireMapField(
  value: xdr.ScVal,
  field: string,
): xdr.ScVal {
  if (value.switch().name !== "scvMap") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Agent Pass policy parameters are invalid",
      403,
    );
  }
  const entry = (value.map() ?? []).find(
    (item) =>
      item.key().switch().name === "scvSymbol" &&
      item.key().sym().toString() === field,
  );
  if (!entry) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      `Agent Pass policy is missing ${field}`,
      403,
    );
  }
  return entry.val();
}

export function validateStellarAgentPassSubmission(
  submission: StellarDeploymentSubmission,
  options: {
    usdcContract: string;
    webauthnVerifierAddress: string;
    ed25519VerifierAddress: string;
    spendingLimitPolicyAddress: string;
  },
): ValidatedStellarAgentPassCreate | ValidatedStellarAgentPassRevoke {
  let func: xdr.HostFunction;
  let auth: xdr.SorobanAuthorizationEntry[];
  try {
    func = xdr.HostFunction.fromXDR(submission.func, "base64");
    auth = submission.auth.map((entry) =>
      xdr.SorobanAuthorizationEntry.fromXDR(entry, "base64"),
    );
  } catch {
    throw new StellarRelayerError(
      "INVALID_REQUEST",
      "func/auth contains invalid XDR",
      400,
    );
  }
  if (func.switch().name !== "hostFunctionTypeInvokeContract" || auth.length !== 1) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Only one owner-authorized Agent Pass operation is accepted",
      403,
    );
  }
  const invoke = func.invokeContract();
  const smartAccount = contractIdOf(
    invoke.contractAddress(),
    "Agent Pass target must be a smart-account contract",
  );
  const functionName = invoke.functionName().toString();
  const args = invoke.args();
  requireOwnerAuthorization(
    auth[0]!,
    invoke,
    smartAccount,
    options.webauthnVerifierAddress,
  );

  if (functionName === "remove_context_rule") {
    if (
      args.length !== 1 ||
      args[0]?.switch().name !== "scvU32" ||
      args[0].u32() === 0
    ) {
      throw new StellarRelayerError(
        "FORBIDDEN_DEPLOYMENT",
        "Agent Pass revocation requires a non-owner context rule",
        403,
      );
    }
    return {
      kind: "agent_pass_revoke",
      func,
      auth,
      smartAccount,
      contextRuleId: args[0].u32(),
    };
  }

  if (functionName !== "add_context_rule" || args.length !== 5) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Only Agent Pass creation or revocation is accepted",
      403,
    );
  }

  const context = args[0];
  const contextParts =
    context?.switch().name === "scvVec" ? context.vec() ?? [] : [];
  if (
    contextParts.length !== 2 ||
    contextParts[0]?.switch().name !== "scvSymbol" ||
    contextParts[0].sym().toString() !== "CallContract" ||
    contextParts[1]?.switch().name !== "scvAddress" ||
    contractIdOf(
      contextParts[1].address(),
      "Agent Pass context must be a contract",
    ) !== options.usdcContract
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Agent Pass must be scoped to the configured Testnet USDC contract",
      403,
    );
  }
  if (
    args[1]?.switch().name !== "scvString" ||
    args[1].str().toString() !== "Telya Agent Pass" ||
    args[2]?.switch().name !== "scvU32" ||
    args[2].u32() === 0
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Agent Pass name or expiration is invalid",
      403,
    );
  }
  const signers = args[3]?.switch().name === "scvVec" ? args[3].vec() ?? [] : [];
  const signerParts =
    signers.length === 1 && signers[0]?.switch().name === "scvVec"
      ? signers[0].vec() ?? []
      : [];
  if (
    signerParts.length !== 3 ||
    signerParts[0]?.switch().name !== "scvSymbol" ||
    signerParts[0].sym().toString() !== "External" ||
    signerParts[1]?.switch().name !== "scvAddress" ||
    contractIdOf(
      signerParts[1].address(),
      "Agent signer verifier must be a contract",
    ) !== options.ed25519VerifierAddress ||
    signerParts[2]?.switch().name !== "scvBytes" ||
    signerParts[2].bytes().length !== 32
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Agent Pass requires exactly one allowlisted Ed25519 signer",
      403,
    );
  }

  const policies = args[4]?.switch().name === "scvMap" ? args[4].map() ?? [] : [];
  if (
    policies.length !== 1 ||
    policies[0]?.key().switch().name !== "scvAddress" ||
    contractIdOf(
      policies[0].key().address(),
      "Agent Pass policy key must be a contract",
    ) !== options.spendingLimitPolicyAddress
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Agent Pass requires only the allowlisted spending-limit policy",
      403,
    );
  }
  const periodValue = requireMapField(policies[0].val(), "period_ledgers");
  const limitValue = requireMapField(policies[0].val(), "spending_limit");
  const spendingLimitRaw = scValToNative(limitValue) as unknown;
  if (
    periodValue.switch().name !== "scvU32" ||
    periodValue.u32() < 1 ||
    typeof spendingLimitRaw !== "bigint" ||
    spendingLimitRaw <= 0n
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Agent Pass spending limit is invalid",
      403,
    );
  }
  const publicKey = Buffer.from(signerParts[2].bytes());
  return {
    kind: "agent_pass_create",
    func,
    auth,
    smartAccount,
    agentAddress: StrKey.encodeEd25519PublicKey(publicKey),
    agentPublicKey: publicKey.toString("hex"),
    tokenContract: options.usdcContract,
    spendingLimitPolicy: options.spendingLimitPolicyAddress,
    spendingLimitRaw,
    periodLedgers: periodValue.u32(),
    validUntilLedger: args[2].u32(),
  };
}

/**
 * Allow only the exact passkey-authorized USDC transfer shape emitted by
 * Smart Account Kit. The browser signs this invocation; the server pays only
 * after binding the auth entry to the same sender, token, recipient and amount.
 */
export function validateStellarUsdcTransferSubmission(
  submission: StellarDeploymentSubmission,
  options: {
    usdcContract: string;
    webauthnVerifierAddress: string;
    ed25519VerifierAddress: string;
  },
): ValidatedStellarUsdcTransfer {
  let func: xdr.HostFunction;
  let auth: xdr.SorobanAuthorizationEntry[];
  try {
    func = xdr.HostFunction.fromXDR(submission.func, "base64");
    auth = submission.auth.map((entry) =>
      xdr.SorobanAuthorizationEntry.fromXDR(entry, "base64"),
    );
  } catch {
    throw new StellarRelayerError(
      "INVALID_REQUEST",
      "func/auth contains invalid XDR",
      400,
    );
  }

  if (func.switch().name !== "hostFunctionTypeInvokeContract" || auth.length !== 1) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Only one passkey-authorized USDC transfer is accepted",
      403,
    );
  }

  const invoke = func.invokeContract();
  const tokenContract = contractIdOf(
    invoke.contractAddress(),
    "Transfer token must be a contract",
  );
  if (tokenContract !== options.usdcContract) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Transfer token is not the allowlisted Testnet USDC contract",
      403,
    );
  }
  const args = invoke.args();
  if (invoke.functionName().toString() !== "transfer" || args.length !== 3) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Only the USDC transfer function is accepted",
      403,
    );
  }

  const sender = requireTransferAddress(args[0]!, "Transfer sender");
  const recipient = requireTransferAddress(args[1]!, "Transfer recipient");
  if (!StrKey.isValidContract(sender) || sender === recipient) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Transfer sender must be a distinct smart-account contract",
      403,
    );
  }
  const amount = scValToNative(args[2]!) as unknown;
  if (typeof amount !== "bigint" || amount <= 0n) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Transfer amount must be positive atomic USDC units",
      403,
    );
  }

  const authorization = requireSmartAccountAuthorization(auth[0]!, invoke, sender);
  const isOwner =
    authorization.contextRuleId === 0 &&
    authorization.verifierAddress === options.webauthnVerifierAddress &&
    authorization.keyData.length > 65 &&
    authorization.keyData[0] === 0x04;
  const isAgent =
    authorization.contextRuleId > 0 &&
    authorization.verifierAddress === options.ed25519VerifierAddress &&
    authorization.keyData.length === 32;
  if (!isOwner && !isAgent) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Transfer signer is not an allowlisted owner or Agent Pass signer",
      403,
    );
  }

  return {
    kind: "usdc_transfer",
    func,
    auth,
    tokenContract,
    sender,
    recipient,
    amountRaw: amount,
    authorizationKind: isOwner ? "owner" : "agent",
    contextRuleId: authorization.contextRuleId,
    signerAddress: isOwner
      ? options.webauthnVerifierAddress
      : StrKey.encodeEd25519PublicKey(authorization.keyData),
  };
}

export function validateStellarRelayerSubmission(
  submission: StellarDeploymentSubmission,
  options: {
    accountWasmHash: string;
    webauthnVerifierAddress: string;
    ed25519VerifierAddress: string;
    spendingLimitPolicyAddress: string;
    usdcContract: string;
  },
): ValidatedStellarRelayerSubmission {
  let func: xdr.HostFunction;
  try {
    func = xdr.HostFunction.fromXDR(submission.func, "base64");
  } catch {
    throw new StellarRelayerError(
      "INVALID_REQUEST",
      "func/auth contains invalid XDR",
      400,
    );
  }
  if (func.switch().name === "hostFunctionTypeCreateContractV2") {
    return validateStellarDeploymentSubmission(submission, options);
  }
  if (func.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Unsupported Stellar relayer operation",
      403,
    );
  }
  const invoke = func.invokeContract();
  const functionName = invoke.functionName().toString();
  return functionName === "add_context_rule" || functionName === "remove_context_rule"
    ? validateStellarAgentPassSubmission(submission, options)
    : validateStellarUsdcTransferSubmission(submission, options);
}

export function agentPassRuleIdFromReturnValue(value: xdr.ScVal | undefined): number {
  if (!value || value.switch().name !== "scvMap") {
    throw new StellarRelayerError(
      "SUBMISSION_FAILED",
      "Stellar did not return the created Agent Pass rule",
      502,
    );
  }
  const id = (value.map() ?? []).find(
    (entry) =>
      entry.key().switch().name === "scvSymbol" &&
      entry.key().sym().toString() === "id",
  )?.val();
  if (!id || id.switch().name !== "scvU32" || id.u32() === 0) {
    throw new StellarRelayerError(
      "SUBMISSION_FAILED",
      "Stellar returned an invalid Agent Pass rule ID",
      502,
    );
  }
  return id.u32();
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar deployment relayer is not configured",
      503,
    );
  }
  return value;
}

function maxResourceFee(environment: NodeJS.ProcessEnv): bigint {
  const raw = environment.STELLAR_RELAYER_MAX_RESOURCE_FEE_STROOPS;
  try {
    const value = raw ? BigInt(raw) : DEFAULT_MAX_RESOURCE_FEE_STROOPS;
    if (value < 0n) throw new Error("negative");
    return value;
  } catch {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar relayer fee ceiling is invalid",
      503,
    );
  }
}

export async function submitStellarRelayerTransaction(
  validated: ValidatedStellarRelayerSubmission,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ hash: string; ledger: number; returnValue?: xdr.ScVal }> {
  const rpcUrl = requiredEnvironmentValue(environment, "STELLAR_RPC_URL");
  const accountWasmHash = requiredEnvironmentValue(
    environment,
    "STELLAR_ACCOUNT_WASM_HASH",
  ).toLowerCase();
  const webauthnVerifierAddress = requiredEnvironmentValue(
    environment,
    "STELLAR_WEBAUTHN_VERIFIER",
  );
  const ed25519VerifierAddress = requiredEnvironmentValue(
    environment,
    "STELLAR_ED25519_VERIFIER",
  );
  const spendingLimitPolicyAddress = requiredEnvironmentValue(
    environment,
    "STELLAR_SPENDING_LIMIT_POLICY",
  );
  const usdcContract = requiredEnvironmentValue(environment, "STELLAR_USDC_SAC");
  const sponsorSecret = requiredEnvironmentValue(
    environment,
    "STELLAR_FEE_SPONSOR_SECRET",
  );
  if ((environment.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET) !== Networks.TESTNET) {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar relayer is restricted to Testnet",
      503,
    );
  }

  // Revalidate against server configuration immediately before the sponsor pays.
  const submission = {
    func: validated.func.toXDR("base64"),
    auth: validated.auth.map((entry) => entry.toXDR("base64")),
  };
  const checked = validateStellarRelayerSubmission(submission, {
    accountWasmHash,
    webauthnVerifierAddress,
    ed25519VerifierAddress,
    spendingLimitPolicyAddress,
    usdcContract,
  });
  if (checked.kind !== validated.kind) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Relayer operation changed during validation",
      403,
    );
  }

  let sponsor: Keypair;
  try {
    sponsor = Keypair.fromSecret(sponsorSecret);
  } catch (error) {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar deployment relayer is not configured",
      503,
      { cause: error },
    );
  }

  const server = new rpc.Server(rpcUrl);
  let source: Account;
  try {
    source = await server.getAccount(sponsor.publicKey());
  } catch (error) {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar fee sponsor is unavailable",
      503,
      { cause: error },
    );
  }

  const transaction = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: checked.func,
        auth: [...checked.auth],
      }),
    )
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(transaction);
  if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation)) {
    throw new StellarRelayerError(
      "SUBMISSION_FAILED",
      "Stellar rejected the sponsored operation simulation",
      422,
    );
  }
  if (BigInt(simulation.minResourceFee) > maxResourceFee(environment)) {
    throw new StellarRelayerError(
      "FEE_LIMIT_EXCEEDED",
      "The sponsored operation exceeds the fee ceiling",
      413,
    );
  }

  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  prepared.sign(sponsor);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new StellarRelayerError(
      "SUBMISSION_FAILED",
      "Stellar rejected the sponsored operation",
      502,
    );
  }

  const result = await server.pollTransaction(sent.hash, { attempts: 20 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new StellarRelayerError(
      "SUBMISSION_FAILED",
      result.status === rpc.Api.GetTransactionStatus.FAILED
        ? "The sponsored operation failed on-chain"
        : "The sponsored operation confirmation timed out",
      502,
    );
  }
  return {
    hash: sent.hash,
    ledger: result.ledger,
    ...(result.returnValue ? { returnValue: result.returnValue } : {}),
  };
}

export async function submitStellarDeployment(
  validated: ValidatedStellarDeployment,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ hash: string; ledger: number }> {
  return submitStellarRelayerTransaction(validated, environment);
}

export function parseStellarRelayerRequest(body: unknown): StellarDeploymentSubmission {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StellarRelayerError("INVALID_REQUEST", "Invalid relayer request", 400);
  }
  const value = body as Record<string, unknown>;
  if (
    typeof value.func !== "string" ||
    !Array.isArray(value.auth) ||
    value.auth.length !== 1 ||
    !value.auth.every((entry) => typeof entry === "string") ||
    JSON.stringify(body).length > MAX_REQUEST_BYTES
  ) {
    throw new StellarRelayerError("INVALID_REQUEST", "Invalid relayer request", 400);
  }
  if (value.paymentId !== undefined &&
      (typeof value.paymentId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.paymentId))) {
    throw new StellarRelayerError("INVALID_REQUEST", "Invalid payment ID", 400);
  }
  return {
    func: value.func,
    auth: value.auth as string[],
    ...(typeof value.paymentId === "string" ? { paymentId: value.paymentId.toLowerCase() } : {}),
  };
}
