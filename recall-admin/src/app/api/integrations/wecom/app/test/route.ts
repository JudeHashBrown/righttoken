import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { getIntegrationCredential } from "@/modules/integrations/credential-store";
import {
  createWecomAppAdapter,
  wecomAppConfigSchema,
  WecomDeliveryError
} from "@/modules/notifications/adapters/wecom-app";

const requestSchema = z
  .object({
    recipient: z.string().trim().min(1).max(128)
  })
  .strict();

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireRequestPermission(request, "integrations:manage");
    const body = requestSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!body.success) {
      return NextResponse.json(
        { code: "INVALID_WECOM_TEST_RECIPIENT" },
        { status: 400 }
      );
    }
    const config = wecomAppConfigSchema.safeParse(
      await getIntegrationCredential("WECOM_APP")
    );
    if (!config.success) {
      return NextResponse.json(
        { code: "WECOM_APP_NOT_CONFIGURED" },
        { status: 409 }
      );
    }
    await createWecomAppAdapter(config.data).send({
      recipient: body.data.recipient,
      title: "RightToken 召回后台连接测试",
      summary:
        "企业微信应用通知已连接。此消息不包含任何用户信息。",
      taskUrl: new URL(
        "/settings",
        process.env.APP_URL ?? "http://127.0.0.1:3000"
      ).toString()
    });
    const testedAt = new Date();
    await prisma.integrationCredential.update({
      where: { kind: "WECOM_APP" },
      data: {
        lastTestedAt: testedAt,
        lastSuccessAt: testedAt,
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
    const errorCode =
      error instanceof WecomDeliveryError
        ? error.code
        : "WECOM_APP_CONNECTION_FAILED";
    await prisma.integrationCredential
      .update({
        where: { kind: "WECOM_APP" },
        data: {
          lastTestedAt: new Date(),
          lastErrorCode: errorCode
        }
      })
      .catch(() => undefined);
    return NextResponse.json(
      { code: errorCode },
      { status: 503 }
    );
  }
}
