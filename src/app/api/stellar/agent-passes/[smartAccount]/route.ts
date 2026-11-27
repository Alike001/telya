import { StrKey } from "@stellar/stellar-sdk";

import { getLatestStellarAgentPass } from "../../../../../server/stellar-relayer-requests";
import {
  observeAgentPassExpiry,
  stellarLedgerReaderFromEnvironment,
} from "../../../../../server/stellar-agent-pass-status";
import { stellarUsdcAmountFromRawUnits } from "../../../../../stellar/usdc";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ smartAccount: string }> },
): Promise<Response> {
  const { smartAccount } = await context.params;
  if (!StrKey.isValidContract(smartAccount)) {
    return Response.json(
      { error: "stellar_agent_pass_not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  const pass = await getLatestStellarAgentPass(smartAccount);
  if (!pass) {
    return Response.json(
      { error: "stellar_agent_pass_not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  const spendingLimitAtomic = BigInt(String(pass.spendingLimitAtomic));
  const spentAmountAtomic = BigInt(String(pass.spentAmountAtomic));
  let expiryEvidence;
  try {
    expiryEvidence = await observeAgentPassExpiry({
      storedStatus: pass.status,
      validUntilLedger: Number(pass.validUntilLedger),
      ledgerReader: stellarLedgerReaderFromEnvironment(),
    });
  } catch {
    return Response.json(
      { error: "stellar_agent_pass_status_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      smartAccount: pass.smartAccount,
      ruleId: pass.ruleId,
      agentAddress: pass.agentAddress,
      agentPublicKey: pass.agentPublicKey,
      spendingLimit: stellarUsdcAmountFromRawUnits(spendingLimitAtomic),
      spendingLimitAtomic: spendingLimitAtomic.toString(),
      spentAmount: stellarUsdcAmountFromRawUnits(spentAmountAtomic),
      spentAmountAtomic: spentAmountAtomic.toString(),
      validUntilLedger: pass.validUntilLedger,
      status: expiryEvidence.status,
      observedLedger: expiryEvidence.observedLedger,
      createTransactionHash: pass.createTransactionHash,
      revokeTransactionHash: pass.revokeTransactionHash,
      createdAt: pass.createdAt,
      revokedAt: pass.revokedAt,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
