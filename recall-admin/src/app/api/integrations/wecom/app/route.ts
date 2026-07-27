import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { saveIntegrationCredential } from "@/modules/integrations/credential-store";
import { wecomAppConfigSchema } from "@/modules/notifications/adapters/wecom-app";

const requestSchema = wecomAppConfigSchema.extend({
  displayName: z.string().trim().min(1).max(120),
  enabled: z.boolean()
});

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
        { code: "INVALID_WECOM_APP_CONFIGURATION" },
        { status: 400 }
      );
    }
    const {
      displayName,
      enabled,
      corpId,
      agentId,
      secret
    } = parsed.data;
    const credential = await saveIntegrationCredential(member.id, {
      kind: "WECOM_APP",
      displayName,
      enabled,
      config: { corpId, agentId, secret },
      metadata: {
        corpIdSuffix: corpId.slice(-4),
        agentId
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
      { code: "WECOM_APP_CONFIGURATION_FAILED" },
      { status: 400 }
    );
  }
}
