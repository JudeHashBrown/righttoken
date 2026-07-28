import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import { requireRequestPermission } from "@/modules/auth/guards";
import { transferPrimaryAdmin } from "@/modules/auth/primary-admin";

const transferSchema = z.object({
  targetAdminId: z.string().min(1)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const context = await requireRequestPermission(
      request,
      "admins:manage"
    );
    const parsed = transferSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_PRIMARY_TRANSFER_REQUEST" },
        { status: 400 }
      );
    }

    await transferPrimaryAdmin(
      context.member.id,
      parsed.data.targetAdminId
    );
    return NextResponse.json({ transferred: true });
  } catch {
    return NextResponse.json(
      { code: "PRIMARY_TRANSFER_FORBIDDEN" },
      { status: 403 }
    );
  }
}
