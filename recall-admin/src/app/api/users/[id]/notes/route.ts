import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { addUserNote } from "@/modules/users/user-notes";

const noteSchema = z
  .object({
    body: z.string().trim().min(1).max(2_000)
  })
  .strict();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "tasks:work"
    );
    const parsed = noteSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_USER_NOTE" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const note = await addUserNote(
      member.id,
      id,
      parsed.data.body
    );
    return NextResponse.json({ note }, { status: 201 });
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
    return NextResponse.json(
      { code: "USER_NOTE_FAILED" },
      { status: 400 }
    );
  }
}
