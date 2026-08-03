import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  MailboxConfigurationNotFoundError,
  removeMailboxConfiguration
} from "@/modules/mail/mailbox-credentials";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
    const mailbox = await removeMailboxConfiguration(
      member.id,
      id
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
    return NextResponse.json(
      { code: "MAILBOX_CONFIGURATION_DELETE_FAILED" },
      { status: 400 }
    );
  }
}
