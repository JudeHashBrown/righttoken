import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { UserAssignmentError } from "@/modules/users/assignment-errors";
import { resolveUserAssignment } from "@/modules/users/resolve-user-assignment";

const assignmentSchema = z
  .object({
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/u)
      .optional(),
    region: z.string().trim().max(120).optional(),
    ownerId: z.string().min(1).optional(),
    reason: z.string().trim().min(1).max(500)
  })
  .strict()
  .refine((value) => Boolean(value.countryCode || value.ownerId))
  .refine((value) => !value.region || Boolean(value.countryCode));

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
    (error instanceof UserAssignmentError &&
      error.code === "FORBIDDEN")
  ) {
    return NextResponse.json(
      { code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  if (
    error instanceof UserAssignmentError &&
    error.code === "USER_NOT_FOUND"
  ) {
    return NextResponse.json(
      { code: "USER_NOT_FOUND" },
      { status: 404 }
    );
  }
  if (
    error instanceof UserAssignmentError &&
    error.code === "TARGET_OWNER_INACTIVE"
  ) {
    return NextResponse.json(
      { code: "TARGET_OWNER_UNAVAILABLE" },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { code: "ASSIGNMENT_FAILED" },
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
    const parsed = assignmentSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_ASSIGNMENT" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const result = await resolveUserAssignment({
      userId: id,
      actorId: member.id,
      countryCode: parsed.data.countryCode,
      region: parsed.data.region,
      targetOwnerId: parsed.data.ownerId,
      reason: parsed.data.reason
    });
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
