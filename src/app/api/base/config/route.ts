import "server-only";

import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_MESSAGE_TRANSMITTER,
  BASE_SEPOLIA_TOKEN_MESSENGER,
  BASE_SEPOLIA_USDC,
} from "../../../../base/evm";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      config: {
        network: "base-sepolia",
        chainId: BASE_SEPOLIA_CHAIN_ID,
        usdcAddress: BASE_SEPOLIA_USDC,
        tokenMessengerAddress: BASE_SEPOLIA_TOKEN_MESSENGER,
        messageTransmitterAddress: BASE_SEPOLIA_MESSAGE_TRANSMITTER,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
