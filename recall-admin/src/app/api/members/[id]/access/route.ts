import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  MemberAccessError,
  revokeMemberAccess
} from "@/modules/auth/member-access";

const revokeSchema = z
  .object({
    successorId: z.string().trim().min(1)
  })
  .strict();

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member: actor } = await requireRequestPermission(
      request,
      "operators:manage"
    );
    const { id } = await context.params;
    const parsed = revokeSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "SUCCESSOR_REQUIRED" },
        { status: 400 }
      );
    }
    const result = await revokeMemberAccess(
      actor.id,
      id,
      parsed.data.successorId
    );
    return NextResponse.json(result);
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
    if (error instanceof MemberAccessError) {
      const status =
        error.code === "TARGET_NOT_FOUND" ||
        error.code === "SUCCESSOR_NOT_FOUND"
          ? 404
          : error.code === "SUCCESSOR_REQUIRED"
            ? 400
            : error.code === "SUCCESSOR_INACTIVE" ||
                error.code === "SUCCESSOR_SAME_AS_TARGET"
              ? 409
              : 403;
      return NextResponse.json(
        { code: error.code },
        { status }
      );
    }
    return NextResponse.json(
      { code: "MEMBER_ACCESS_REVOKE_FAILED" },
      { status: 400 }
    );
  }
}
