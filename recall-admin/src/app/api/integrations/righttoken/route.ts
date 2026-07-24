import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { saveIntegrationCredential } from "@/modules/integrations/credential-store";

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("simulator"),
    displayName: z.string().min(1).max(120),
    enabled: z.boolean(),
    eventSecret: z.string().min(32).optional()
  }),
  z.object({
    mode: z.literal("http"),
    displayName: z.string().min(1).max(120),
    enabled: z.boolean(),
    baseUrl: z.string().url(),
    usersPath: z.string().startsWith("/").default("/api/admin/users"),
    apiToken: z.string().min(16),
    eventSecret: z.string().min(32).optional()
  })
]);

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "integrations:manage"
    );
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_RIGHTTOKEN_CONFIGURATION" },
        { status: 400 }
      );
    }
    const { displayName, enabled, ...config } = parsed.data;
    const credential = await saveIntegrationCredential(member.id, {
      kind: "RIGHTTOKEN_SOURCE",
      displayName,
      enabled,
      config,
      metadata: {
        mode: config.mode,
        ...(config.mode === "http"
          ? { endpointHost: new URL(config.baseUrl).hostname }
          : {})
      }
    });
    return NextResponse.json({ credential }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { code: "RIGHTTOKEN_CONFIGURATION_FAILED" },
      { status: 400 }
    );
  }
}
