import type { DecimalAmount } from "../domain";

export const BASE_SEPOLIA_CHAIN_ID = 84_532;
export const CCTP_BASE_DOMAIN = 6;
export const CCTP_STELLAR_DOMAIN = 27;

export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const BASE_SEPOLIA_TOKEN_MESSENGER =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
export const BASE_SEPOLIA_MESSAGE_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MESSAGE_SENT_TOPIC =
  "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ERC20_ALLOWANCE_SELECTOR = "0xdd62ed3e";
const CCTP_DEPOSIT_FOR_BURN_SELECTOR = "0x8e0250ee";
const CCTP_RECEIVE_MESSAGE_SELECTOR = "0x57ecfd28";
const UINT256_MAX = (1n << 256n) - 1n;

export class BaseEvmError extends Error {
  constructor(
    readonly code:
      | "INVALID_CONFIG"
      | "INVALID_ADDRESS"
      | "INVALID_AMOUNT"
      | "RPC_FAILED"
      | "WRONG_NETWORK"
      | "TRANSACTION_FAILED"
      | "TRANSACTION_MISMATCH",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BaseEvmError";
  }
}

export interface BaseEvmConfig {
  readonly rpcUrl: string;
  readonly usdcAddress?: string;
  readonly tokenMessengerAddress?: string;
  readonly messageTransmitterAddress?: string;
}

export interface Eip1193Provider {
  request(input: {
    readonly method: string;
    readonly params?: readonly unknown[];
  }): Promise<unknown>;
}

export interface BaseTransactionReceipt {
  readonly transactionHash: string;
  readonly status: string;
  readonly blockNumber: string;
  readonly logs: readonly BaseLog[];
}

export interface BaseTransaction {
  readonly hash: string;
  readonly from: string;
  readonly to: string | null;
  readonly input: string;
}

export interface BaseLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly data: string;
  readonly transactionHash?: string;
}

export function requireEvmAddress(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    throw new BaseEvmError("INVALID_ADDRESS", `${label} must be a 20-byte EVM address`);
  }
  return normalized.toLowerCase();
}

function requireBytes32(value: string, label: string): string {
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new BaseEvmError("INVALID_ADDRESS", `${label} must be 32-byte hexadecimal`);
  }
  return `0x${normalized}`;
}

function word(value: bigint): string {
  if (value < 0n || value > UINT256_MAX) {
    throw new BaseEvmError("INVALID_AMOUNT", "Value is outside the uint256 range");
  }
  return value.toString(16).padStart(64, "0");
}

function addressWord(address: string): string {
  return requireEvmAddress(address, "address").slice(2).padStart(64, "0");
}

function bytes32Word(value: string, label: string): string {
  return requireBytes32(value, label).slice(2);
}

export function normalizeBaseUsdcAmount(amount: DecimalAmount): bigint {
  const value = amount.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) {
    throw new BaseEvmError(
      "INVALID_AMOUNT",
      "Base USDC amount must be a positive decimal with at most 6 places",
    );
  }
  const [whole, fraction = ""] = value.split(".");
  const raw = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
  if (raw <= 0n) {
    throw new BaseEvmError("INVALID_AMOUNT", "Base USDC amount must be greater than zero");
  }
  return raw;
}

export function normalizeBaseUsdcFee(amount: DecimalAmount): bigint {
  const value = amount.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) {
    throw new BaseEvmError("INVALID_AMOUNT", "Base USDC fee must be a non-negative decimal with at most 6 places");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
}

export function baseEvmConfigFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): BaseEvmConfig {
  const rpcUrl = environment.BASE_SEPOLIA_RPC_URL?.trim() ?? "";
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new BaseEvmError("INVALID_CONFIG", "BASE_SEPOLIA_RPC_URL must be a valid URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new BaseEvmError(
      "INVALID_CONFIG",
      "BASE_SEPOLIA_RPC_URL must be a credential-free HTTPS endpoint",
    );
  }
  return {
    rpcUrl: parsed.toString(),
    usdcAddress: BASE_SEPOLIA_USDC,
    tokenMessengerAddress: BASE_SEPOLIA_TOKEN_MESSENGER,
    messageTransmitterAddress: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  };
}

export function encodeErc20Transfer(recipient: string, amount: DecimalAmount): string {
  return `${ERC20_TRANSFER_SELECTOR}${addressWord(recipient)}${word(normalizeBaseUsdcAmount(amount))}`;
}

export function encodeErc20Approve(spender: string, amount: DecimalAmount): string {
  return `${ERC20_APPROVE_SELECTOR}${addressWord(spender)}${word(normalizeBaseUsdcAmount(amount))}`;
}

function encodeErc20Allowance(owner: string, spender: string): string {
  return `${ERC20_ALLOWANCE_SELECTOR}${addressWord(owner)}${addressWord(spender)}`;
}

export function encodeCctpDepositForBurn(input: {
  readonly amount: DecimalAmount;
  readonly destinationDomain: number;
  readonly mintRecipient: string;
  readonly burnToken?: string;
  readonly destinationCaller?: string;
  readonly maxFee?: DecimalAmount;
  readonly minimumFinalityThreshold?: number;
}): string {
  if (!Number.isSafeInteger(input.destinationDomain) || input.destinationDomain < 0) {
    throw new BaseEvmError("INVALID_CONFIG", "CCTP destination domain is invalid");
  }
  const amount = normalizeBaseUsdcAmount(input.amount);
  const maxFee = input.maxFee ? normalizeBaseUsdcFee(input.maxFee) : 0n;
  if (maxFee >= amount) {
    throw new BaseEvmError("INVALID_AMOUNT", "CCTP max fee must be less than the burn amount");
  }
  const threshold = input.minimumFinalityThreshold ?? 2_000;
  if (!Number.isSafeInteger(threshold) || threshold < 0) {
    throw new BaseEvmError("INVALID_CONFIG", "CCTP finality threshold is invalid");
  }
  const burnToken = input.burnToken ?? BASE_SEPOLIA_USDC;
  const destinationCaller = input.destinationCaller ?? `0x${"0".repeat(64)}`;
  return [
    CCTP_DEPOSIT_FOR_BURN_SELECTOR,
    word(amount),
    word(BigInt(input.destinationDomain)),
    bytes32Word(input.mintRecipient, "mintRecipient"),
    addressWord(burnToken),
    bytes32Word(destinationCaller, "destinationCaller"),
    word(maxFee),
    word(BigInt(threshold)),
  ].join("");
}

export function encodeCctpReceiveMessage(message: string, attestation: string): string {
  const messageBytes = hexBytes(message, "message");
  const attestationBytes = hexBytes(attestation, "attestation");
  const messageTail = dynamicBytes(messageBytes);
  const attestationTail = dynamicBytes(attestationBytes);
  const headSize = 64;
  return [
    CCTP_RECEIVE_MESSAGE_SELECTOR,
    word(BigInt(headSize)),
    word(BigInt(headSize + messageTail.length / 2)),
    messageTail,
    attestationTail,
  ].join("");
}

function hexBytes(value: string, label: string): string {
  const normalized = value.trim().replace(/^0x/i, "").toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new BaseEvmError("TRANSACTION_MISMATCH", `${label} must be non-empty hexadecimal bytes`);
  }
  return normalized;
}

function dynamicBytes(value: string): string {
  const paddedLength = Math.ceil(value.length / 64) * 64;
  return `${word(BigInt(value.length / 2))}${value.padEnd(paddedLength, "0")}`;
}

export async function sendBaseTransaction(input: {
  readonly provider: Eip1193Provider;
  readonly from: string;
  readonly to: string;
  readonly data: string;
}): Promise<string> {
  const from = requireEvmAddress(input.from, "from");
  const to = requireEvmAddress(input.to, "to");
  const chainId = await input.provider.request({ method: "eth_chainId" });
  if (typeof chainId !== "string" || BigInt(chainId) !== BigInt(BASE_SEPOLIA_CHAIN_ID)) {
    throw new BaseEvmError("WRONG_NETWORK", "Switch your wallet to Base Sepolia before continuing");
  }
  const result = await input.provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to, data: input.data }],
  });
  if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result)) {
    throw new BaseEvmError("TRANSACTION_FAILED", "Wallet did not return a transaction hash");
  }
  return result.toLowerCase();
}

export async function submitBaseUsdcTransfer(input: {
  readonly provider: Eip1193Provider;
  readonly sender: string;
  readonly recipient: string;
  readonly amount: DecimalAmount;
}): Promise<string> {
  return sendBaseTransaction({
    provider: input.provider,
    from: input.sender,
    to: BASE_SEPOLIA_USDC,
    data: encodeErc20Transfer(input.recipient, input.amount),
  });
}

async function waitForWalletTransaction(
  provider: Eip1193Provider,
  transactionHash: string,
): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const receipt = await provider.request({
      method: "eth_getTransactionReceipt",
      params: [transactionHash],
    });
    if (receipt !== null && typeof receipt === "object") {
      const status = (receipt as { readonly status?: unknown }).status;
      if (status !== "0x1") {
        throw new BaseEvmError("TRANSACTION_FAILED", "Base USDC approval did not succeed");
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new BaseEvmError("TRANSACTION_FAILED", "Base USDC approval confirmation timed out");
}

/** Submit a Circle burn using the connected wallet; no private key enters Telya. */
export async function submitBaseCctpBurn(input: {
  readonly provider: Eip1193Provider;
  readonly sender: string;
  readonly burnAmount: DecimalAmount;
  readonly maxFee: DecimalAmount;
  readonly destinationDomain: number;
  readonly mintRecipient: string;
}): Promise<{ readonly transactionHash: string; readonly approvalTransactionHash?: string }> {
  const sender = requireEvmAddress(input.sender, "sender");
  const amount = normalizeBaseUsdcAmount(input.burnAmount);
  const allowanceData = await input.provider.request({
    method: "eth_call",
    params: [{
      from: sender,
      to: BASE_SEPOLIA_USDC,
      data: encodeErc20Allowance(sender, BASE_SEPOLIA_TOKEN_MESSENGER),
    }, "latest"],
  });
  if (typeof allowanceData !== "string" || !/^0x[0-9a-f]+$/i.test(allowanceData)) {
    throw new BaseEvmError("TRANSACTION_FAILED", "Wallet could not read the USDC allowance");
  }
  let approvalTransactionHash: string | undefined;
  if (BigInt(allowanceData) < amount) {
    approvalTransactionHash = await sendBaseTransaction({
      provider: input.provider,
      from: sender,
      to: BASE_SEPOLIA_USDC,
      data: encodeErc20Approve(BASE_SEPOLIA_TOKEN_MESSENGER, input.burnAmount),
    });
    await waitForWalletTransaction(input.provider, approvalTransactionHash);
  }
  const transactionHash = await sendBaseTransaction({
    provider: input.provider,
    from: sender,
    to: BASE_SEPOLIA_TOKEN_MESSENGER,
    data: encodeCctpDepositForBurn({
      amount: input.burnAmount,
      maxFee: input.maxFee,
      destinationDomain: input.destinationDomain,
      mintRecipient: input.mintRecipient,
    }),
  });
  return approvalTransactionHash
    ? { transactionHash, approvalTransactionHash }
    : { transactionHash };
}

export interface BaseRpc {
  request<T>(method: string, params: readonly unknown[]): Promise<T>;
}

export function createBaseRpc(config: BaseEvmConfig, fetcher: typeof fetch = fetch): BaseRpc {
  let requestId = 0;
  return {
    async request<T>(method: string, params: readonly unknown[]): Promise<T> {
      let response: Response;
      try {
        response = await fetcher(config.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
          cache: "no-store",
        });
      } catch (error) {
        throw new BaseEvmError("RPC_FAILED", "Base Sepolia RPC request failed", { cause: error });
      }
      if (!response.ok) {
        throw new BaseEvmError("RPC_FAILED", `Base Sepolia RPC returned HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        readonly result?: T;
        readonly error?: { readonly message?: string };
      };
      if (payload.error || payload.result === undefined) {
        throw new BaseEvmError("RPC_FAILED", payload.error?.message ?? "Base Sepolia RPC omitted its result");
      }
      return payload.result;
    },
  };
}

export async function getBaseTransactionReceipt(
  rpc: BaseRpc,
  transactionHash: string,
): Promise<BaseTransactionReceipt | null> {
  const hash = transactionHash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) {
    throw new BaseEvmError("TRANSACTION_MISMATCH", "Invalid Base transaction hash");
  }
  const receipt = await rpc.request<BaseTransactionReceipt | null>(
    "eth_getTransactionReceipt",
    [hash],
  );
  if (receipt && receipt.transactionHash.toLowerCase() !== hash) {
    throw new BaseEvmError("TRANSACTION_MISMATCH", "Base RPC returned a different transaction receipt");
  }
  return receipt;
}

export async function isBaseTransactionFinalized(
  rpc: BaseRpc,
  receipt: BaseTransactionReceipt,
): Promise<boolean> {
  if (receipt.status !== "0x1") return false;
  const finalized = await rpc.request<{ readonly number?: string } | null>(
    "eth_getBlockByNumber",
    ["finalized", false],
  );
  if (!finalized?.number) return false;
  return BigInt(receipt.blockNumber) <= BigInt(finalized.number);
}

export interface BaseUsdcTransferVerification {
  readonly status: "pending" | "failed" | "mismatch" | "verified";
  readonly transactionHash: string;
  readonly recipient?: string;
  readonly amount?: string;
  readonly reason?: string;
}

export async function verifyBaseUsdcTransfer(input: {
  readonly rpc: BaseRpc;
  readonly txHash: string;
  readonly tokenAddress?: string;
  readonly expectedRecipient: string;
  readonly expectedSender: string;
  readonly expectedAmount: DecimalAmount;
}): Promise<BaseUsdcTransferVerification> {
  const txHash = input.txHash.trim().toLowerCase();
  const receipt = await getBaseTransactionReceipt(input.rpc, txHash);
  if (!receipt) return { status: "pending", transactionHash: txHash };
  if (receipt.status !== "0x1") return { status: "failed", transactionHash: txHash };
  if (!(await isBaseTransactionFinalized(input.rpc, receipt))) {
    return { status: "pending", transactionHash: txHash };
  }
  const transaction = await input.rpc.request<BaseTransaction | null>(
    "eth_getTransactionByHash",
    [txHash],
  );
  if (!transaction || transaction.hash.toLowerCase() !== txHash) {
    return { status: "pending", transactionHash: txHash };
  }
  const expectedSender = requireEvmAddress(input.expectedSender, "sender");
  if (requireEvmAddress(transaction.from, "transaction sender") !== expectedSender) {
    return {
      status: "mismatch",
      transactionHash: txHash,
      reason: "Base transaction sender does not match the payment source wallet",
    };
  }
  const tokenAddress = (input.tokenAddress ?? BASE_SEPOLIA_USDC).toLowerCase();
  const expectedRecipient = requireEvmAddress(input.expectedRecipient, "recipient");
  const expectedAmount = normalizeBaseUsdcAmount(input.expectedAmount);
  const transfers = receipt.logs
    .filter((log) => log.address.toLowerCase() === tokenAddress)
    .filter((log) => log.topics[0]?.toLowerCase() === TRANSFER_TOPIC)
    .filter((log) => log.topics.length === 3 && /^0x[0-9a-f]{64}$/i.test(log.data))
    .map((log) => ({
      sender: `0x${log.topics[1]!.slice(-40)}`.toLowerCase(),
      recipient: `0x${log.topics[2]!.slice(-40)}`.toLowerCase(),
      amount: BigInt(log.data),
    }))
    .filter((transfer) =>
      transfer.sender === expectedSender && transfer.recipient === expectedRecipient,
    );
  if (transfers.length !== 1 || transfers[0]!.amount !== expectedAmount) {
    return {
      status: "mismatch",
      transactionHash: txHash,
      reason: "Finalized Base receipt does not prove the exact expected USDC recipient and amount",
    };
  }
  return {
    status: "verified",
    transactionHash: txHash,
    recipient: expectedRecipient,
    amount: input.expectedAmount,
  };
}

export async function verifyBaseCctpMint(input: {
  readonly rpc: BaseRpc;
  readonly txHash: string;
  readonly message: string;
  readonly attestation: string;
  readonly expectedRecipient: string;
  readonly expectedAmount: DecimalAmount;
}): Promise<BaseUsdcTransferVerification> {
  const txHash = input.txHash.trim().toLowerCase();
  const receipt = await getBaseTransactionReceipt(input.rpc, txHash);
  if (!receipt) return { status: "pending", transactionHash: txHash };
  if (receipt.status !== "0x1") return { status: "failed", transactionHash: txHash };
  if (!(await isBaseTransactionFinalized(input.rpc, receipt))) {
    return { status: "pending", transactionHash: txHash };
  }
  const transaction = await input.rpc.request<BaseTransaction | null>(
    "eth_getTransactionByHash",
    [txHash],
  );
  if (!transaction || transaction.hash.toLowerCase() !== txHash) {
    return { status: "pending", transactionHash: txHash };
  }
  if (
    transaction.to?.toLowerCase() !== BASE_SEPOLIA_MESSAGE_TRANSMITTER.toLowerCase() ||
    transaction.input.toLowerCase() !== encodeCctpReceiveMessage(input.message, input.attestation).toLowerCase()
  ) {
    return {
      status: "mismatch",
      transactionHash: txHash,
      reason: "Base destination transaction did not submit the reserved Circle message and attestation",
    };
  }
  return verifyBaseUsdcTransfer({
    rpc: input.rpc,
    txHash,
    expectedSender: `0x${"0".repeat(40)}`,
    expectedRecipient: input.expectedRecipient,
    expectedAmount: input.expectedAmount,
  });
}

export function findBaseCctpMessage(input: {
  readonly receipt: BaseTransactionReceipt;
  readonly messageTransmitterAddress?: string;
}): string | null {
  const transmitter = (input.messageTransmitterAddress ?? BASE_SEPOLIA_MESSAGE_TRANSMITTER).toLowerCase();
  const entries = input.receipt.logs.filter((log) =>
    log.address.toLowerCase() === transmitter &&
    log.topics[0]?.toLowerCase() === MESSAGE_SENT_TOPIC,
  );
  if (entries.length !== 1) return null;
  const data = entries[0]!.data.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(data) || data.length < 128) return null;
  const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
  if (!Number.isSafeInteger(offset) || offset + 64 > data.length) return null;
  const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`)) * 2;
  const start = offset + 64;
  if (!Number.isSafeInteger(length) || length <= 0 || start + length > data.length) return null;
  return `0x${data.slice(start, start + length)}`;
}

export interface ParsedCctpMessage {
  readonly sourceDomain: number;
  readonly destinationDomain: number;
  readonly sender: string;
  readonly recipient: string;
  readonly destinationCaller: string;
  readonly minFinalityThreshold: number;
  readonly finalityThresholdExecuted: number;
  readonly burnToken: string;
  readonly mintRecipient: string;
  readonly amount: bigint;
  readonly messageSender: string;
  readonly maxFee: bigint;
}

export function parseCctpMessage(message: string): ParsedCctpMessage {
  const bytes = hexBytes(message, "CCTP message");
  if (bytes.length < 148 * 2 + 228 * 2) {
    throw new BaseEvmError("TRANSACTION_MISMATCH", "CCTP message is too short");
  }
  const uint32 = (offset: number) => Number(BigInt(`0x${bytes.slice(offset * 2, (offset + 4) * 2)}`));
  const bytes32 = (offset: number) => `0x${bytes.slice(offset * 2, (offset + 32) * 2)}`;
  const body = bytes.slice(148 * 2);
  const bodyU32 = (offset: number) => Number(BigInt(`0x${body.slice(offset * 2, (offset + 4) * 2)}`));
  const bodyBytes32 = (offset: number) => `0x${body.slice(offset * 2, (offset + 32) * 2)}`;
  return {
    sourceDomain: uint32(4),
    destinationDomain: uint32(8),
    sender: bytes32(44),
    recipient: bytes32(76),
    destinationCaller: bytes32(108),
    minFinalityThreshold: uint32(140),
    finalityThresholdExecuted: uint32(144),
    burnToken: bodyBytes32(4),
    mintRecipient: bodyBytes32(36),
    amount: BigInt(`0x${body.slice(68 * 2, 100 * 2)}`),
    messageSender: bodyBytes32(100),
    maxFee: BigInt(`0x${body.slice(132 * 2, 164 * 2)}`),
  };
}
