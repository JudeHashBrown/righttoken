import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { getIntegrationCredential } from "@/modules/integrations/credential-store";
import {
  createWecomWebhookAdapter,
  wecomWebhookConfigSchema
} from "@/modules/notifications/adapters/wecom-webhook";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireRequestPermission(request, "integrations:manage");
    const parsed = wecomWebhookConfigSchema.safeParse(
      await getIntegrationCredential("WECOM_ROBOT")
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "WECOM_NOT_CONFIGURED" },
        { status: 409 }
      );
    }
    await createWecomWebhookAdapter(parsed.data).send({
      recipient: "integration:wecom-robot",
      title: "RightToken 召回后台连接测试",
      summary: "企微通知通道已连接。此消息不包含任何用户信息。",
      taskUrl: new URL(
        "/settings",
        process.env.APP_URL ?? "http://127.0.0.1:3000"
      ).toString()
    });
    await prisma.integrationCredential.update({
      where: { kind: "WECOM_ROBOT" },
      data: {
        lastTestedAt: new Date(),
        lastSuccessAt: new Date(),
        lastErrorCode: null
      }
    });
    return NextResponse.json({ ok: true });
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
    await prisma.integrationCredential
      .update({
        where: { kind: "WECOM_ROBOT" },
        data: {
          lastTestedAt: new Date(),
          lastErrorCode: "WECOM_CONNECTION_FAILED"
        }
      })
      .catch(() => undefined);
    return NextResponse.json(
      { code: "WECOM_CONNECTION_FAILED" },
      { status: 503 }
    );
  }
}
