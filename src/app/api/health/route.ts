import { probeDatabase } from "../../../server/database";
import { createReadinessReport } from "../../../server/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const report = await createReadinessReport(probeDatabase);

  return Response.json(report, {
    status: report.status === "ready" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
