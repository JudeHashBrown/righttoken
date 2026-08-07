import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  contactInputSchema,
  saveUserContact
} from "@/modules/b-group/contact-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "tasks:work"
    );
    const parsed = contactInputSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_CONTACT" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const contact = await saveUserContact(
      member.id,
      id,
      parsed.data
    );
    return NextResponse.json({ contact });
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
      { code: "CONTACT_SAVE_FAILED" },
      { status: 400 }
    );
  }
}
