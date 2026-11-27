import "server-only";

import {
  AuthenticationError,
  authenticateRequest,
} from "../../../../../../../server/auth/privy";
import {
  STELLAR_DEPLOYMENT_RELAYER_PATH,
  StellarDeploymentAuthorizationError,
  createStellarDeploymentExecutionSession,
  stellarDeploymentSessionCookie,
} from "../../../../../../../server/wallets/deployment-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await authenticateRequest(request);
    const session = await createStellarDeploymentExecutionSession(user);
    return Response.json(
      { relayerUrl: STELLAR_DEPLOYMENT_RELAYER_PATH, expiresAt: session.expiresAt },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": stellarDeploymentSessionCookie(session.token),
        },
      },
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    if (error instanceof StellarDeploymentAuthorizationError) {
      return Response.json(
        { error: "deployment_not_authorized" },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      { error: "deployment_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
