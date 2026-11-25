import "server-only";

import { getStellarUsdcTransferReceipt } from "../../../../../server/stellar-relayer-requests";
import { stellarUsdcAmountFromRawUnits } from "../../../../../stellar/usdc";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ txHash: string }> },
): Promise<Response> {
  const { txHash } = await params;
  const receipt = await getStellarUsdcTransferReceipt(txHash);
  if (!receipt) {
    return Response.json(
      { error: "stellar_transfer_not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const expectedAtomic = BigInt(String(receipt.expectedAmountAtomic));
  const verifiedAtomic = receipt.verifiedAmountAtomic
    ? BigInt(String(receipt.verifiedAmountAtomic))
    : null;
  return Response.json(
    {
      status: receipt.status,
      transactionHash: receipt.transactionHash,
      ledger: receipt.ledger,
      sender: receipt.sender,
      recipient: receipt.recipient,
      expectedAmount: stellarUsdcAmountFromRawUnits(expectedAtomic),
      verifiedRecipient: receipt.verifiedRecipient,
      verifiedAmount:
        verifiedAtomic === null
          ? null
          : stellarUsdcAmountFromRawUnits(verifiedAtomic),
      verifiedAt: receipt.verifiedAt,
      failureCode: receipt.failureCode,
      authorizationKind: receipt.authorizationKind,
      contextRuleId: receipt.contextRuleId,
      events: receipt.events,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${receipt.transactionHash}`,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
