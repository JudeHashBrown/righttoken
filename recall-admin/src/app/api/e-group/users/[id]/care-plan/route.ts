import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import { ForbiddenError, requireRequestPermission, UnauthorizedError } from "@/modules/auth/guards";
import { addPersonalizedCarePlan, carePlanInputSchema } from "@/modules/e-group/operations";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(request, "tasks:work");
    const parsed = carePlanInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ code: "INVALID_CARE_PLAN" }, { status: 400 });
    const { id } = await context.params;
    const plan = await addPersonalizedCarePlan(member.id, id, parsed.data);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json({ code: "CARE_PLAN_SAVE_FAILED" }, { status: 400 });
  }
}
