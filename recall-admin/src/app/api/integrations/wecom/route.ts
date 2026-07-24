import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { saveIntegrationCredential } from "@/modules/integrations/credential-store";
import { wecomWebhookConfigSchema } from "@/modules/notifications/adapters/wecom-webhook";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "integrations:manage"
    );
    const body = (await request.json().catch(() => null)) as {
      displayName?: unknown;
      enabled?: unknown;
      webhookUrl?: unknown;
    } | null;
    const config = wecomWebhookConfigSchema.safeParse({
      webhookUrl: body?.webhookUrl
    });
    if (
      !config.success ||
      typeof body?.displayName !== "string" ||
      typeof body.enabled !== "boolean"
    ) {
      return NextResponse.json(
        { code: "INVALID_WECOM_CONFIGURATION" },
        { status: 400 }
      );
    }
    const credential = await saveIntegrationCredential(member.id, {
      kind: "WECOM_ROBOT",
      displayName: body.displayName,
      enabled: body.enabled,
      config: config.data,
      metadata: {
        endpointHost: new URL(config.data.webhookUrl).hostname
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
      { code: "WECOM_CONFIGURATION_FAILED" },
      { status: 400 }
    );
  }
}
