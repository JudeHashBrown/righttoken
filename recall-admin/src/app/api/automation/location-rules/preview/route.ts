import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { previewPublishedLocationRules } from "@/modules/location/rule-service";
import { locationRuleInputSchema } from "@/modules/location/rule-schema";

const requestSchema = z
  .object({
    rules: z.array(locationRuleInputSchema).min(1).max(500)
  })
  .strict();

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireRequestPermission(
      request,
      "location-rules:publish"
    );
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_LOCATION_RULE_PREVIEW" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await previewPublishedLocationRules(parsed.data.rules)
    );
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
      { code: "LOCATION_RULE_PREVIEW_REJECTED" },
      { status: 400 }
    );
  }
}

