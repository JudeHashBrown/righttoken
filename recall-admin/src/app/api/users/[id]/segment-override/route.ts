import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  createSegmentOverride,
  revokeSegmentOverride
} from "@/modules/segmentation/segment-override";

const createSchema = z
  .object({
    segment: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
    reason: z.string().trim().min(3).max(500),
    expiresAt: z.iso.datetime()
  })
  .strict();

const revokeSchema = z
  .object({
    overrideId: z.string().min(1)
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

function accessError(error: unknown): NextResponse | null {
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
  return null;
}

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "rules:publish"
    );
    const parsed = createSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_SEGMENT_OVERRIDE" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const override = await createSegmentOverride(
      member.id,
      id,
      parsed.data.segment,
      parsed.data.reason,
      new Date(parsed.data.expiresAt)
    );
    return NextResponse.json({ override }, { status: 201 });
  } catch (error) {
    return (
      accessError(error) ??
      NextResponse.json(
        { code: "SEGMENT_OVERRIDE_FAILED" },
        { status: 400 }
      )
    );
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
      "rules:publish"
    );
    const parsed = revokeSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_SEGMENT_OVERRIDE" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    await revokeSegmentOverride(
      member.id,
      parsed.data.overrideId,
      new Date(),
      id
    );
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return (
      accessError(error) ??
      NextResponse.json(
        { code: "SEGMENT_OVERRIDE_FAILED" },
        { status: 400 }
      )
    );
  }
}
