import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { UserLocationError } from "@/modules/users/location-errors";
import {
  manuallyAssignUserLocation,
  restoreAutomaticUserLocation
} from "@/modules/users/user-location-service";

const locationSchema = z
  .object({
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/u),
    region: z.string().trim().max(120).optional(),
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
    (error instanceof UserLocationError &&
      error.code === "FORBIDDEN")
  ) {
    return NextResponse.json(
      { code: "FORBIDDEN" },
      { status: 403 }
    );
  }
  if (
    error instanceof UserLocationError &&
    error.code === "USER_NOT_FOUND"
  ) {
    return NextResponse.json(
      { code: "USER_NOT_FOUND" },
      { status: 404 }
    );
  }
  if (
    error instanceof UserLocationError &&
    error.code === "LOCATION_ALREADY_AUTOMATIC"
  ) {
    return NextResponse.json(
      { code: error.code },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { code: "LOCATION_CHANGE_FAILED" },
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
    const parsed = locationSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_LOCATION_CHANGE" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const result = await manuallyAssignUserLocation({
      userId: id,
      actorId: member.id,
      countryCode: parsed.data.countryCode,
      region: parsed.data.region,
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
    const result = await restoreAutomaticUserLocation({
      userId: id,
      actorId: member.id
    });
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
