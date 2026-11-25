import { StrKey } from "@stellar/stellar-sdk";

import { getLatestStellarAgentPass } from "../../../../../server/stellar-relayer-requests";
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
  return Response.json(
    {
      smartAccount: pass.smartAccount,
      ruleId: pass.ruleId,
      agentAddress: pass.agentAddress,
      agentPublicKey: pass.agentPublicKey,
      spendingLimit: stellarUsdcAmountFromRawUnits(spendingLimitAtomic),
      spendingLimitAtomic: spendingLimitAtomic.toString(),
      spentAmount: stellarUsdcAmountFromRawUnits(spentAmountAtomic),
      validUntilLedger: pass.validUntilLedger,
      status: pass.status,
      createTransactionHash: pass.createTransactionHash,
      revokeTransactionHash: pass.revokeTransactionHash,
      createdAt: pass.createdAt,
      revokedAt: pass.revokedAt,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
