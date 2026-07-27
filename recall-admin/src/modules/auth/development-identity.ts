import type {
  Member,
  Session
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionContext } from "@/modules/auth/session";

export class DevelopmentIdentityError extends Error {
  constructor() {
    super(
      "Development identity requires an active primary administrator"
    );
    this.name = "DevelopmentIdentityError";
  }
}

export async function getDevelopmentPrimaryAdmin(): Promise<Member> {
  const member = await prisma.member.findFirst({
    where: { role: "PRIMARY_ADMIN", active: true },
    orderBy: { createdAt: "asc" }
  });

  if (!member) {
    throw new DevelopmentIdentityError();
  }

  return member;
}

export function createDevelopmentSessionContext(
  member: Member
): SessionContext {
  const now = new Date();
  const session: Session = {
    id: "development-session",
    memberId: member.id,
    tokenHash: "development-session",
    expiresAt: new Date("9999-12-31T23:59:59.999Z"),
    reauthenticatedAt: now,
    secondFactorRequired: false,
    secondFactorVerifiedAt: now,
    createdAt: now,
    lastSeenAt: now
  };

  return { member, session };
}
