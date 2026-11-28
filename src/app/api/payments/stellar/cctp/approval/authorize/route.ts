import "server-only";

import { createStellarCctpApprovalAuthorizationHandler, createStellarCctpApprovalStatusHandler } from "../../../../../../../../server/api/stellar-payments";

export const dynamic = "force-dynamic";

export const POST = createStellarCctpApprovalAuthorizationHandler();
export const GET = createStellarCctpApprovalStatusHandler();
