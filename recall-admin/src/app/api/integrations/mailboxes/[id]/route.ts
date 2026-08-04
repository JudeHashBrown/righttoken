import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  MailboxConfigurationNotFoundError,
  MailboxConfigurationVersionConflictError,
  removeMailboxConfiguration
} from "@/modules/mail/mailbox-credentials";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const deleteMailboxConfigurationSchema = z
  .object({
    configurationVersion: z.number().int().positive()
  })
  .strict();

export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "integrations:manage"
    );
    const { id } = await context.params;
    const parsed = deleteMailboxConfigurationSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAILBOX_CONFIGURATION_DELETE_REQUEST" },
        { status: 400 }
      );
    }
    const mailbox = await removeMailboxConfiguration(
      member.id,
      id,
      parsed.data.configurationVersion
    );
    return NextResponse.json({ mailbox });
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
    if (error instanceof MailboxConfigurationNotFoundError) {
      return NextResponse.json(
        { code: "MAILBOX_CONFIGURATION_NOT_FOUND" },
        { status: 404 }
      );
    }
    if (
      error instanceof MailboxConfigurationVersionConflictError
    ) {
      return NextResponse.json(
        { code: "MAILBOX_CONFIGURATION_VERSION_CONFLICT" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { code: "MAILBOX_CONFIGURATION_DELETE_FAILED" },
      { status: 400 }
    );
  }
}
