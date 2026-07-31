import { NextRequest, NextResponse } from "next/server";
import { isValidInternalBearer } from "@/modules/integrations/internal-api-auth";
import {
  siteVisitInputSchema
} from "@/modules/visits/ingest";

export type SiteVisitHandlerDependencies = {
  getSecrets(): {
    current: string;
    previous?: string;
  } | Promise<{
    current: string;
    previous?: string;
  }>;
  ingestVisit(
    input: unknown
  ): Promise<"created" | "duplicate">;
};

export function createSiteVisitHandler(
  dependencies: SiteVisitHandlerDependencies
) {
  return async function siteVisitHandler(
    request: NextRequest
  ): Promise<NextResponse> {
    const secrets = await dependencies.getSecrets();
    if (
      !isValidInternalBearer(
        request.headers.get("authorization"),
        secrets.current,
        secrets.previous
      )
    ) {
      return NextResponse.json(
        { code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!siteVisitInputSchema.safeParse(body).success) {
      return NextResponse.json(
        { code: "INVALID_VISIT" },
        { status: 400 }
      );
    }

    try {
      const result = await dependencies.ingestVisit(body);
      return NextResponse.json(
        { accepted: true, duplicate: result === "duplicate" },
        { status: result === "duplicate" ? 200 : 202 }
      );
    } catch {
      return NextResponse.json(
        { code: "VISIT_INGESTION_UNAVAILABLE" },
        { status: 503 }
      );
    }
  };
}
