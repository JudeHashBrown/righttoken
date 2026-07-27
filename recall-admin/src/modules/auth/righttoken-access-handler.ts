import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Member } from "@/generated/prisma/client";
import { isValidInternalBearer } from "@/modules/integrations/internal-api-auth";

const identitySchema = z.object({
  externalUserId: z.string().min(1).max(255),
  email: z.string().email().max(320)
});

export type RightTokenAccessHandlerDependencies = {
  getSecrets(): {
    current: string;
    previous?: string;
  } | Promise<{
    current: string;
    previous?: string;
  }>;
  findMember(identity: {
    rightTokenUserId: string;
    email: string;
  }): Promise<Member | null>;
};

export function createRightTokenAccessCheckHandler(
  dependencies: RightTokenAccessHandlerDependencies
) {
  return async function rightTokenAccessCheck(
    request: NextRequest
  ): Promise<NextResponse> {
    const secrets = await dependencies.getSecrets();
    if (
      !isValidInternalBearer(
        request.headers.get("authorization"),
        secrets.current,
        secrets.previous
      )
    ) {
      return NextResponse.json(
        { code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const parsed = identitySchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_IDENTITY" },
        { status: 400 }
      );
    }

    try {
      const member = await dependencies.findMember({
        rightTokenUserId: parsed.data.externalUserId,
        email: parsed.data.email.trim().toLowerCase()
      });
      return NextResponse.json({
        allowed: Boolean(member?.active)
      });
    } catch {
      return NextResponse.json(
        { code: "ACCESS_CHECK_UNAVAILABLE" },
        { status: 503 }
      );
    }
  };
}
