import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission
} from "@/modules/auth/guards";
import {
  acceptInvitation,
  createInvitation
} from "@/modules/auth/invitations";
import {
  assertRecentReauthentication,
  ReauthenticationRequiredError
} from "@/modules/auth/primary-admin";

const invitationSchema = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  role: z.enum(["ADMIN", "OPERATOR"])
});

const acceptInvitationSchema = z.object({
  token: z.string().min(20),
  displayName: z.string().trim().min(1).max(80),
  password: z.string().min(12)
});

const reauthenticationError = {
  error: {
    code: "REAUTH_REQUIRED",
    message: "请重新验证后继续"
  }
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const parsed = invitationSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_INVITATION_REQUEST" },
        { status: 400 }
      );
    }

    const permission =
      parsed.data.role === "ADMIN"
        ? ("admins:manage" as const)
        : ("operators:manage" as const);
    const { member, session } = await requireRequestPermission(
      request,
      permission
    );
    assertRecentReauthentication(session);
    const invitation = await createInvitation(
      member.id,
      parsed.data.email,
      parsed.data.role
    );

    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    if (error instanceof ReauthenticationRequiredError) {
      return NextResponse.json(reauthenticationError, {
        status: 401
      });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { code: "INVITATION_FAILED" },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const parsed = acceptInvitationSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_INVITATION_ACCEPTANCE" },
        { status: 400 }
      );
    }

    const member = await acceptInvitation(parsed.data.token, {
      displayName: parsed.data.displayName,
      password: parsed.data.password
    });
    return NextResponse.json(
      {
        member: {
          id: member.id,
          displayName: member.displayName,
          role: member.role
        }
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { code: "INVITATION_ACCEPTANCE_FAILED" },
      { status: 400 }
    );
  }
}
