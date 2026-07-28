import { createHash, randomBytes } from "node:crypto";
import type { Member, MemberRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError } from "@/modules/auth/guards";

const INVITATION_DURATION_MS = 48 * 60 * 60 * 1000;

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function assertInvitationPermission(
  actorRole: MemberRole,
  invitedRole: MemberRole
): void {
  if (invitedRole === "PRIMARY_ADMIN") {
    throw new ForbiddenError("admins:manage");
  }
  if (actorRole === "PRIMARY_ADMIN") {
    return;
  }
  if (actorRole === "ADMIN" && invitedRole === "OPERATOR") {
    return;
  }
  throw new ForbiddenError(
    invitedRole === "ADMIN" ? "admins:manage" : "operators:manage"
  );
}

export async function createInvitation(
  actorId: string,
  email: string,
  role: Exclude<MemberRole, "PRIMARY_ADMIN">
): Promise<{
  invitationId: string;
  token: string;
  role: Exclude<MemberRole, "PRIMARY_ADMIN">;
  expiresAt: Date;
}> {
  const normalizedEmail = email.trim().toLowerCase();
  const actor = await prisma.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("operators:manage");
  }
  assertInvitationPermission(actor.role, role);

  const existingMember = await prisma.member.findUnique({
    where: { email: normalizedEmail },
    select: { id: true }
  });
  if (existingMember) {
    throw new Error("a member with this email already exists");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_DURATION_MS);
  const invitation = await prisma.invitation.create({
    data: {
      email: normalizedEmail,
      role,
      tokenHash: hashInvitationToken(token),
      invitedById: actorId,
      expiresAt
    },
    select: { id: true }
  });

  return {
    invitationId: invitation.id,
    token,
    role,
    expiresAt
  };
}

export async function acceptInvitation(
  token: string,
  input: { displayName: string }
): Promise<Member> {
  const tokenHash = hashInvitationToken(token);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash }
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt <= new Date()
  ) {
    throw new Error("invalid or expired invitation");
  }
  if (invitation.role === "PRIMARY_ADMIN") {
    throw new Error("primary administrator invitations are not allowed");
  }

  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("invalid invitation profile");
  }

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        email: invitation.email,
        displayName,
        passwordHash: "RIGHTTOKEN_MANAGED_IDENTITY",
        role: invitation.role
      }
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() }
    });
    return member;
  });
}
