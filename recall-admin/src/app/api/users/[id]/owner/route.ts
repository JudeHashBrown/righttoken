import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { UserOwnerError } from "@/modules/users/owner-errors";
import {
  manuallyAssignUserOwner,
  restoreAutomaticUserOwner
} from "@/modules/users/user-owner-service";

const ownerSchema = z
  .object({
    ownerId: z.string().min(1),
    reason: z.string().trim().min(1).max(500)
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  if (
    error instanceof ForbiddenError ||
    (error instanceof UserOwnerError &&
      error.code === "FORBIDDEN")
  ) {
    return NextResponse.json(
      { code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  if (
    error instanceof UserOwnerError &&
    error.code === "USER_NOT_FOUND"
  ) {
    return NextResponse.json(
      { code: "USER_NOT_FOUND" },
      { status: 404 }
    );
  }
  if (
    error instanceof UserOwnerError &&
    ["TARGET_OWNER_INACTIVE", "TARGET_OWNER_INVALID"].includes(
      error.code
    )
  ) {
    return NextResponse.json(
      { code: "TARGET_OWNER_UNAVAILABLE" },
      { status: 409 }
    );
  }
  if (
    error instanceof UserOwnerError &&
    [
      "INITIAL_AUTOMATIC_ASSIGNMENT_REQUIRED",
      "OWNER_ALREADY_AUTOMATIC"
    ].includes(error.code)
  ) {
    return NextResponse.json(
      { code: error.code },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { code: "OWNER_CHANGE_FAILED" },
    { status: 400 }
  );
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "operators:manage"
    );
    const parsed = ownerSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_OWNER_CHANGE" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const result = await manuallyAssignUserOwner({
      userId: id,
      actorId: member.id,
      targetOwnerId: parsed.data.ownerId,
      reason: parsed.data.reason
    });
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "operators:manage"
    );
    const { id } = await context.params;
    const result = await restoreAutomaticUserOwner({
      userId: id,
      actorId: member.id
    });
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
