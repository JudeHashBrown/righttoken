import { NextResponse } from "next/server";
import { checkReadiness } from "@/modules/health/readiness";

type DependencyProbe = () => Promise<unknown>;

export function createReadyHandler(probe: DependencyProbe) {
  return async function readyHandler(): Promise<NextResponse> {
    const result = await checkReadiness(probe);
    return NextResponse.json(
      {
        status: result.ready ? "ready" : "unavailable",
        checkedAt: new Date().toISOString()
      },
      {
        status: result.ready ? 200 : 503,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  };
}
