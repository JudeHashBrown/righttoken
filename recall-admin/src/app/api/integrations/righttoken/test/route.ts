import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { getConfiguredRightTokenAdapter } from "@/modules/integrations/righttoken/runtime-adapter";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireRequestPermission(request, "integrations:manage");
    const adapter = await getConfiguredRightTokenAdapter();
    if (!adapter) {
      return NextResponse.json(
        { code: "RIGHTTOKEN_NOT_CONFIGURED" },
        { status: 409 }
      );
    }
    const result = await adapter.verifyConnection();
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
    return NextResponse.json(
      { code: "RIGHTTOKEN_CONNECTION_FAILED" },
      { status: 503 }
    );
  }
}
