import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  assignInboundMessage,
  MailMessageAssignmentError
} from "@/modules/mail/assign-inbound-message";

const assignmentSchema = z
  .object({
    userId: z.string().min(1)
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const [{ member }, { id }] = await Promise.all([
      requireRequestPermission(
        request,
        "mail:send-reviewed"
      ),
      context.params
    ]);
    const parsed = assignmentSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAIL_ASSIGNMENT_REQUEST" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await assignInboundMessage({
        actorId: member.id,
        messageId: id,
        userId: parsed.data.userId
      })
    );
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
    if (error instanceof MailMessageAssignmentError) {
      return NextResponse.json(
        { code: "MAIL_MESSAGE_ALREADY_ASSIGNED" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { code: "MAIL_ASSIGNMENT_FAILED" },
      { status: 500 }
    );
  }
}
