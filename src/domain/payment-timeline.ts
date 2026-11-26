import type {
  Fee,
  Network,
  PaymentRoute,
  PaymentStatus,
  TransactionReference,
} from "./contracts";
import type { PersistedPayment, PersistedPaymentEvent } from "./payment-activity";

export interface TimelineStep {
  readonly id: string;
  readonly stage: PaymentStatus;
  readonly title: string;
  readonly description: string;
  readonly network: Network | null;
  readonly status: "pending" | "current" | "completed" | "failed" | "stalled";
  readonly txHash: string | null;
  readonly explorerUrl: string | null;
  readonly completedAt: string | null;
  readonly errorMessage: string | null;
}

export interface ComputedTimeline {
  readonly routeId: PaymentRoute["id"];
  readonly currentStatus: PaymentStatus;
  readonly steps: readonly TimelineStep[];
  readonly currentStepIndex: number;
  readonly isCompleted: boolean;
  readonly isFailed: boolean;
  readonly isStalled: boolean;
  readonly failureStage: PaymentStatus | null;
  readonly failureReason: string | null;
  readonly elapsedSeconds: number;
  readonly elapsedFormatted: string;
  readonly latestMessage: string;
  readonly sourceTransaction: TransactionReference | null;
  readonly destinationTransaction: TransactionReference | null;
}

export interface PaymentReceipt {
  readonly paymentId: string;
  readonly routeId: PaymentRoute["id"];
  readonly sourceNetwork: Network;
  readonly destinationNetwork: Network;
  readonly rail: PaymentRoute["rail"];
  readonly recipient: string;
  readonly verifiedRecipient: string;
  readonly expectedAmount: string;
  readonly verifiedAmount: string;
  readonly asset: string;
  readonly fees: readonly Fee[];
  readonly status: PaymentStatus;
  readonly isFullySettled: boolean;
  readonly sourceTransaction: TransactionReference | null;
  readonly destinationTransaction: TransactionReference | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly durationFormatted: string;
}

// Stage blueprints for each of the 4 supported P0 routes
interface StageBlueprint {
  readonly stage: PaymentStatus;
  readonly title: string;
  readonly description: string;
  readonly network: Network | null;
}

const STELLAR_TO_STELLAR_STAGES: readonly StageBlueprint[] = [
  {
    stage: "authorized",
    title: "Passkey Authorization",
    description: "Device passkey signature validated for the exact payment.",
    network: "stellar",
  },
  {
    stage: "submitted",
    title: "Submitted to Stellar",
    description: "Fee-sponsored transaction submitted to Stellar Testnet relayer.",
    network: "stellar",
  },
  {
    stage: "destination_confirmed",
    title: "Stellar Finality Confirmed",
    description: "Transaction closed and ledger sequence finalized.",
    network: "stellar",
  },
  {
    stage: "recipient_verified",
    title: "Recipient & Amount Verified",
    description: "Finalized transfer evidence matches the exact recipient and amount.",
    network: "stellar",
  },
  {
    stage: "completed",
    title: "Delivered",
    description: "Digital dollars safely transferred into recipient smart account.",
    network: "stellar",
  },
];

const BASE_TO_BASE_STAGES: readonly StageBlueprint[] = [
  {
    stage: "authorized",
    title: "Wallet Authorization",
    description: "Base transaction signature confirmed.",
    network: "base",
  },
  {
    stage: "submitted",
    title: "Submitted to Base",
    description: "USDC transfer broadcasted to Base Sepolia mempool.",
    network: "base",
  },
  {
    stage: "destination_confirmed",
    title: "Base Block Finality",
    description: "Transaction receipt confirmed in Base Sepolia block.",
    network: "base",
  },
  {
    stage: "recipient_verified",
    title: "Recipient & Amount Verified",
    description: "Finalized transfer evidence matches the exact recipient and amount.",
    network: "base",
  },
  {
    stage: "completed",
    title: "Delivered",
    description: "Funds settled in recipient Base address.",
    network: "base",
  },
];

const BASE_TO_STELLAR_CCTP_STAGES: readonly StageBlueprint[] = [
  {
    stage: "authorized",
    title: "Base Authorization",
    description: "Passkey/Wallet approval for cross-chain burn on Base.",
    network: "base",
  },
  {
    stage: "submitted",
    title: "Burn Submitted on Base",
    description: "Circle TokenMessenger.depositForBurn broadcasted on Base Sepolia.",
    network: "base",
  },
  {
    stage: "source_confirmed",
    title: "Base Source Confirmed",
    description: "Burn transaction finalized in Base Sepolia block.",
    network: "base",
  },
  {
    stage: "awaiting_attestation",
    title: "Circle CCTP Attestation",
    description: "Waiting for Circle Iris cryptographic attestation signature.",
    network: null,
  },
  {
    stage: "destination_submitted",
    title: "Mint Submitted to Stellar",
    description: "ReceiveMessage transaction sent to Stellar Soroban contract.",
    network: "stellar",
  },
  {
    stage: "destination_confirmed",
    title: "Stellar Finality Confirmed",
    description: "Stellar Testnet ledger sealed with minted native USDC.",
    network: "stellar",
  },
  {
    stage: "recipient_verified",
    title: "Destination Recipient Verified",
    description: "Verified recipient address and amount on Stellar Testnet.",
    network: "stellar",
  },
  {
    stage: "completed",
    title: "Delivered",
    description: "Native Stellar USDC successfully credited to recipient account.",
    network: "stellar",
  },
];

const STELLAR_TO_BASE_CCTP_STAGES: readonly StageBlueprint[] = [
  {
    stage: "authorized",
    title: "Passkey Authorization",
    description: "Passkey signature approving CCTP burn on Stellar Testnet.",
    network: "stellar",
  },
  {
    stage: "submitted",
    title: "Burn Submitted on Stellar",
    description: "DepositForBurn executed on Soroban CCTP contract.",
    network: "stellar",
  },
  {
    stage: "source_confirmed",
    title: "Stellar Source Confirmed",
    description: "Stellar ledger sealed and burn event verified.",
    network: "stellar",
  },
  {
    stage: "awaiting_attestation",
    title: "Circle CCTP Attestation",
    description: "Circle Iris signing attestation for minted Base tokens.",
    network: null,
  },
  {
    stage: "destination_submitted",
    title: "Mint Submitted on Base",
    description: "Relayer broadcasting receiveMessage on Base Sepolia.",
    network: "base",
  },
  {
    stage: "destination_confirmed",
    title: "Base Block Finality",
    description: "Base Sepolia block sealed and confirmed.",
    network: "base",
  },
  {
    stage: "recipient_verified",
    title: "Destination Recipient Verified",
    description: "Verified exact USDC credit to recipient address.",
    network: "base",
  },
  {
    stage: "completed",
    title: "Delivered",
    description: "Native Base USDC successfully settled.",
    network: "base",
  },
];

/** Return the appropriate explorer URL for a given network and transaction hash. */
export function getExplorerUrl(network: Network, txHash: string): string {
  if (network === "stellar") {
    return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
  }
  return `https://sepolia.basescan.org/tx/${txHash}`;
}

/** Formats elapsed seconds into human-readable duration (e.g. "4s", "1m 12s"). */
export function formatDuration(seconds: number): string {
  const safeSec = Math.max(0, Math.floor(seconds));
  if (safeSec < 60) {
    return `${safeSec}s`;
  }
  const mins = Math.floor(safeSec / 60);
  const remainingSecs = safeSec % 60;
  return `${mins}m ${remainingSecs}s`;
}

function equalDecimal(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return `${whole}.${fraction.replace(/0+$/, "")}`;
  };
  return normalize(left) === normalize(right);
}

function equalAddress(network: Network, left: string, right: string): boolean {
  return network === "base" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** Returns the stage blueprint for a given route. */
export function getRouteBlueprints(routeId: PaymentRoute["id"]): readonly StageBlueprint[] {
  switch (routeId) {
    case "stellar_to_stellar":
      return STELLAR_TO_STELLAR_STAGES;
    case "base_to_base":
      return BASE_TO_BASE_STAGES;
    case "base_to_stellar_cctp":
      return BASE_TO_STELLAR_CCTP_STAGES;
    case "stellar_to_base_cctp":
      return STELLAR_TO_BASE_CCTP_STAGES;
  }
}

/** Map PaymentStatus order for progress comparison. */
const STAGE_ORDER: Record<PaymentStatus, number> = {
  created: 0,
  route_resolved: 1,
  awaiting_confirmation: 2,
  authorized: 3,
  submitted: 4,
  source_confirmed: 5,
  awaiting_attestation: 6,
  destination_submitted: 7,
  destination_confirmed: 8,
  recipient_verified: 9,
  completed: 10,
  failed: -1,
};

/**
 * Computes the live payment timeline strictly from domain Payment and PaymentEvent records.
 * Invariant: Never renders fake timers or fake progress bars.
 */
export function computePaymentTimeline(
  payment: PersistedPayment,
  events: readonly PersistedPaymentEvent[],
  nowMs = Date.now(),
): ComputedTimeline {
  const blueprints = getRouteBlueprints(payment.route.id);
  const isFailed = payment.status === "failed";
  const isCompleted = payment.status === "completed";

  // Calculate real elapsed time from creation to completion, or to nowMs
  const startMs = new Date(payment.createdAt).getTime();
  const endMs = isCompleted && payment.completedAt
    ? new Date(payment.completedAt).getTime()
    : nowMs;
  const elapsedSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const elapsedFormatted = formatDuration(elapsedSeconds);

  // Group events by stage for fast lookup
  const eventsByStage = new Map<PaymentStatus, PersistedPaymentEvent>();
  for (const event of events) {
    eventsByStage.set(event.stage, event);
  }

  const currentStageRank = STAGE_ORDER[payment.status];
  let currentStepIdx = 0;
  let isStalled = false;

  // Determine latest user-facing message
  let latestMessage = isCompleted
    ? "Payment completed and destination settlement verified."
    : isFailed
      ? (payment.failureCode
          ? `Payment failed during execution: ${payment.failureCode}`
          : "Payment failed during execution.")
      : "Payment processing...";

  if (events.length > 0) {
    const latestEvent = events[events.length - 1];
    if (latestEvent?.publicMessage) {
      latestMessage = latestEvent.publicMessage;
    }
  }

  // A long payment is not stalled when a recent durable stage has progressed.
  const lastProgressMs = events.reduce((latest, event) => {
    const eventTime = new Date(event.completedAt ?? event.occurredAt).getTime();
    return Number.isFinite(eventTime) ? Math.max(latest, eventTime) : latest;
  }, startMs);
  const waitingOnNetwork = [
    "submitted", "source_confirmed", "awaiting_attestation", "destination_submitted",
    "destination_confirmed", "recipient_verified",
  ].includes(payment.status);
  if (waitingOnNetwork && !isCompleted && !isFailed && nowMs - lastProgressMs > 90_000) {
    isStalled = true;
  }

  const steps: TimelineStep[] = blueprints.map((blueprint, index) => {
    const stageRank = STAGE_ORDER[blueprint.stage];
    const event = eventsByStage.get(blueprint.stage);

    let status: TimelineStep["status"] = "pending";
    let txHash: string | null = event?.txHash ?? null;
    let explorerUrl: string | null = event?.explorerUrl ?? null;
    let completedAt: string | null = null;
    let errorMessage: string | null = null;

    if (txHash && !explorerUrl && blueprint.network) {
      explorerUrl = getExplorerUrl(blueprint.network, txHash);
    }

    if (isCompleted) {
      status = "completed";
      completedAt = payment.completedAt;
    } else if (isFailed) {
      if (event && event.stage !== "failed") {
        status = "completed";
      } else {
        status = "pending";
      }
    } else {
      // Payment is active / in progress
      if (currentStageRank > stageRank) {
        status = "completed";
      } else if (currentStageRank === stageRank) {
        status = isStalled ? "stalled" : "current";
        currentStepIdx = index;
      } else {
        status = "pending";
      }
    }

    return {
      id: `${payment.id}_${blueprint.stage}`,
      stage: blueprint.stage,
      title: blueprint.title,
      description: blueprint.description,
      network: blueprint.network,
      status,
      txHash,
      explorerUrl,
      completedAt,
      errorMessage,
    };
  });

  if (isCompleted) {
    currentStepIdx = steps.length - 1;
  }

  return {
    routeId: payment.route.id,
    currentStatus: payment.status,
    steps,
    currentStepIndex: currentStepIdx,
    isCompleted,
    isFailed,
    isStalled,
    failureStage: null,
    failureReason: payment.failureCode,
    elapsedSeconds,
    elapsedFormatted,
    latestMessage,
    sourceTransaction: payment.sourceTransaction,
    destinationTransaction: payment.destinationTransaction,
  };
}

/**
 * Builds a structured, consumer-safe receipt from persisted Payment/Event data.
 */
export function buildPaymentReceipt(
  payment: PersistedPayment,
  events: readonly PersistedPaymentEvent[],
): PaymentReceipt | null {
  const destinationHash = payment.destinationTransaction?.txHash ?? null;
  const isFullySettled = payment.status === "completed" &&
    payment.verifiedRecipient !== null &&
    equalAddress(payment.route.destinationNetwork, payment.verifiedRecipient, payment.recipientAddress) &&
    payment.verifiedAmount !== null && equalDecimal(payment.verifiedAmount, payment.expectedAmount) &&
    destinationHash !== null &&
    events.some((event) => event.stage === "recipient_verified" && event.txHash === destinationHash) &&
    events.some((event) => event.stage === "completed" && event.txHash === destinationHash);
  if (!isFullySettled || !payment.completedAt) return null;
  const startMs = new Date(payment.createdAt).getTime();
  const endMs = isFullySettled && payment.completedAt
    ? new Date(payment.completedAt).getTime()
    : Date.now();
  const durationSec = Math.max(0, Math.round((endMs - startMs) / 1000));

  return {
    paymentId: payment.id,
    routeId: payment.route.id,
    sourceNetwork: payment.route.sourceNetwork,
    destinationNetwork: payment.route.destinationNetwork,
    rail: payment.route.rail,
    recipient: payment.recipientAddress,
    verifiedRecipient: payment.verifiedRecipient,
    expectedAmount: payment.expectedAmount,
    verifiedAmount: payment.verifiedAmount,
    asset: payment.asset,
    fees: payment.fees,
    status: payment.status,
    isFullySettled,
    sourceTransaction: payment.sourceTransaction,
    destinationTransaction: payment.destinationTransaction,
    createdAt: payment.createdAt,
    completedAt: payment.completedAt,
    durationFormatted: formatDuration(durationSec),
  };
}

