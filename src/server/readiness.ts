export type DependencyStatus = "ok" | "unavailable";

export interface ReadinessReport {
  readonly status: "ready" | "degraded";
  readonly environment: "testnet";
  readonly checkedAt: string;
  readonly checks: {
    readonly application: "ok";
    readonly database: DependencyStatus;
  };
}

export async function createReadinessReport(
  databaseProbe: () => Promise<boolean>,
  now: () => Date = () => new Date(),
): Promise<ReadinessReport> {
  let databaseReady = false;

  try {
    databaseReady = await databaseProbe();
  } catch {
    databaseReady = false;
  }

  return {
    status: databaseReady ? "ready" : "degraded",
    environment: "testnet",
    checkedAt: now().toISOString(),
    checks: {
      application: "ok",
      database: databaseReady ? "ok" : "unavailable",
    },
  };
}
