import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";

const inputSchema = z
  .object({
    wecomUserId: z.string().trim().max(128).nullable()
  })
  .strict();

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member: actor } = await requireRequestPermission(
      request,
      "operators:manage"
    );
    const parsed = inputSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_WECOM_USER_ID" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const wecomUserId = parsed.data.wecomUserId?.trim() || null;
    const member = await prisma.member.update({
      where: { id },
      data: { wecomUserId },
      select: {
        id: true,
        wecomUserId: true
      }
    });
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: "member.wecom_mapping_updated",
        entityType: "MemberWecomMapping",
        entityId: member.id,
        metadata: {
          mapped: Boolean(member.wecomUserId)
        }
      }
    });
    return NextResponse.json({ member });
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { code: "WECOM_USER_ID_ALREADY_MAPPED" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { code: "WECOM_MAPPING_FAILED" },
      { status: 400 }
    );
  }
}
