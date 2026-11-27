import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  validate: vi.fn(),
  submit: vi.fn(),
  reserve: vi.fn(),
  recordBurnAuthorization: vi.fn(),
  recordBurnSubmission: vi.fn(),
  completeRequest: vi.fn(),
  recordTransferAuthorization: vi.fn(),
  recordTransferSubmission: vi.fn(),
  completeTransfer: vi.fn(),
  recordAgentPassAuthorization: vi.fn(),
  completeAgentPassCreation: vi.fn(),
  completeAgentPassRevocation: vi.fn(),
  assertAgentPass: vi.fn(),
  recordAgentSpend: vi.fn(),
  identity: vi.fn(),
  authenticate: vi.fn(),
  validateCctpPayment: vi.fn(),
  linkCctpPayment: vi.fn(),
}));

vi.mock("../../../../stellar/relayer", () => ({
  agentPassRuleIdFromReturnValue: vi.fn(),
  parseStellarRelayerRequest: mocks.parse,
  StellarRelayerError: class StellarRelayerError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  submitStellarRelayerTransaction: mocks.submit,
  validateStellarRelayerSubmission: mocks.validate,
}));

vi.mock("../../../../stellar/usdc", () => ({
  stellarUsdcAmountFromRawUnits: vi.fn(),
  verifyStellarUsdcTransfer: vi.fn(),
}));

vi.mock("../../../../server/stellar-relayer-requests", () => ({
  assertActiveAgentPassForTransfer: mocks.assertAgentPass,
  assertStellarPaymentRequestLink: vi.fn(),
  completeStellarAgentPassCreation: mocks.completeAgentPassCreation,
  completeStellarAgentPassRevocation: mocks.completeAgentPassRevocation,
  completeStellarUsdcTransferRequest: mocks.completeTransfer,
  completeStellarRelayerRequest: mocks.completeRequest,
  recordStellarCctpBurnAuthorization: mocks.recordBurnAuthorization,
  recordStellarCctpBurnSubmission: mocks.recordBurnSubmission,
  recordStellarAgentPassAuthorization: mocks.recordAgentPassAuthorization,
  recordStellarUsdcTransferAuthorization: mocks.recordTransferAuthorization,
  recordStellarUsdcTransferSubmission: mocks.recordTransferSubmission,
  recordVerifiedAgentPassSpend: mocks.recordAgentSpend,
  reserveStellarRelayerRequest: mocks.reserve,
  stellarRelayerRequestIdentity: mocks.identity,
  linkStellarPaymentAuthorization: vi.fn(),
  linkStellarCctpPaymentAuthorization: mocks.linkCctpPayment,
  validateStellarCctpPaymentAuthorization: mocks.validateCctpPayment,
  validateStellarPaymentAuthorization: vi.fn(),
}));

vi.mock("../../../../../server/auth/privy", () => ({
  AuthenticationError: class AuthenticationError extends Error {},
  AuthenticationUnavailableError: class AuthenticationUnavailableError extends Error {},
  authenticateRequest: mocks.authenticate,
}));

import { handleStellarRelayerRequest } from "./handler";

const TRANSACTION_HASH = "a".repeat(64);

describe("shared Stellar relayer CCTP integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CCTP_STELLAR_TOKEN_MESSENGER", "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM");
    vi.stubEnv("CCTP_BASE_DOMAIN", "6");
    mocks.parse.mockReturnValue({ func: "signed-cctp-burn", auth: ["passkey"] });
    mocks.validate.mockReturnValue({ kind: "cctp_burn", smartAccount: "smart-account" });
    mocks.identity.mockReturnValue({ requestHash: "request-hash", clientKeyHash: "client-key-hash" });
    mocks.reserve.mockResolvedValue({ decision: "reserved" });
    mocks.submit.mockResolvedValue({ hash: TRANSACTION_HASH, ledger: 123, returnValue: null });
  });

  it("persists source authorization before broadcast and the submitted burn before relayer success", async () => {
    const response = await handleStellarRelayerRequest(new Request(
      "https://telya.test/api/stellar/relayer",
      { method: "POST", body: JSON.stringify({ func: "signed", auth: ["passkey"] }) },
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      hash: TRANSACTION_HASH,
      status: "SUCCESS",
    });
    expect(mocks.validate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cctpTokenMessenger: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      baseDomain: 6,
    }));
    expect(mocks.recordBurnAuthorization).toHaveBeenCalledWith(
      "request-hash",
      expect.objectContaining({ kind: "cctp_burn" }),
    );
    expect(mocks.recordBurnSubmission).toHaveBeenCalledWith("request-hash", {
      transactionHash: TRANSACTION_HASH,
      ledger: 123,
    });
    expect(mocks.completeRequest).toHaveBeenCalledWith("request-hash", {
      status: "succeeded",
      transactionHash: TRANSACTION_HASH,
    });
    expect(mocks.recordBurnAuthorization.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0]!,
    );
    expect(mocks.submit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordBurnSubmission.mock.invocationCallOrder[0]!,
    );
    expect(mocks.recordBurnSubmission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.completeRequest.mock.invocationCallOrder[0]!,
    );
  });

  it("binds the reviewed CCTP payment before broadcasting the burn", async () => {
    const paymentContext = {
      userId: "11111111-1111-4111-8111-111111111111",
      paymentId: "22222222-2222-4222-8222-222222222222",
    };
    const response = await handleStellarRelayerRequest(new Request(
      "https://telya.test/api/stellar/relayer/payment",
      { method: "POST", body: JSON.stringify({ func: "signed", auth: ["passkey"] }) },
    ), paymentContext);

    expect(response.status).toBe(200);
    expect(mocks.validateCctpPayment).toHaveBeenCalledWith(
      paymentContext.userId,
      paymentContext.paymentId,
      expect.objectContaining({ kind: "cctp_burn" }),
    );
    expect(mocks.linkCctpPayment).toHaveBeenCalledWith(
      paymentContext.userId,
      paymentContext.paymentId,
      "request-hash",
      expect.objectContaining({ kind: "cctp_burn" }),
    );
    expect(mocks.validateCctpPayment.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0]!,
    );
    expect(mocks.linkCctpPayment.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.submit.mock.invocationCallOrder[0]!,
    );
  });
});
