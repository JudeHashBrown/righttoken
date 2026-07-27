import type { Member } from "@/generated/prisma/client";
import type { RightTokenIdentity } from "@/modules/auth/righttoken-ticket";

export interface RightTokenMemberStore {
  findByRightTokenUserId(
    rightTokenUserId: string
  ): Promise<Member | null>;
  findByEmail(email: string): Promise<Member | null>;
  bindRightTokenUserId(
    memberId: string,
    rightTokenUserId: string
  ): Promise<Member>;
  redeemJti(jti: string, expiresAt: Date): Promise<boolean>;
}

class PrismaRightTokenMemberStore
  implements RightTokenMemberStore
{
  async findByRightTokenUserId(
    rightTokenUserId: string
  ): Promise<Member | null> {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma.member.findUnique({
      where: { rightTokenUserId }
    });
  }

  async findByEmail(email: string): Promise<Member | null> {
    const { prisma } = await import("@/lib/db/prisma");
    return prisma.member.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive"
        }
      }
    });
  }

  async bindRightTokenUserId(
    memberId: string,
    rightTokenUserId: string
  ): Promise<Member> {
    const { prisma } = await import("@/lib/db/prisma");
    const result = await prisma.member.updateMany({
      where: {
        id: memberId,
        rightTokenUserId: null
      },
      data: { rightTokenUserId }
    });
    if (result.count !== 1) {
      throw new Error("member identity binding conflict");
    }
    return prisma.member.findUniqueOrThrow({
      where: { id: memberId }
    });
  }

  async redeemJti(
    jti: string,
    expiresAt: Date
  ): Promise<boolean> {
    const { prisma } = await import("@/lib/db/prisma");
    try {
      await prisma.ssoTicketRedemption.create({
        data: { jti, expiresAt }
      });
      return true;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  }
}

const defaultStore = new PrismaRightTokenMemberStore();

export async function findRightTokenMemberForAccess(
  identity: {
    rightTokenUserId: string;
    email: string;
  },
  store: RightTokenMemberStore = defaultStore
): Promise<Member | null> {
  const bySubject = await store.findByRightTokenUserId(
    identity.rightTokenUserId
  );
  if (bySubject) {
    return bySubject.active ? bySubject : null;
  }

  const byEmail = await store.findByEmail(
    identity.email.trim().toLowerCase()
  );
  if (
    !byEmail ||
    !byEmail.active ||
    (byEmail.rightTokenUserId &&
      byEmail.rightTokenUserId !== identity.rightTokenUserId)
  ) {
    return null;
  }
  return byEmail;
}

export async function resolveRightTokenMember(
  identity: RightTokenIdentity,
  store: RightTokenMemberStore = defaultStore
): Promise<Member | null> {
  const candidate = await findRightTokenMemberForAccess(
    identity,
    store
  );
  if (!candidate) {
    return null;
  }
  if (candidate.rightTokenUserId === identity.rightTokenUserId) {
    return candidate;
  }

  try {
    return await store.bindRightTokenUserId(
      candidate.id,
      identity.rightTokenUserId
    );
  } catch {
    return null;
  }
}

export async function redeemRightTokenJti(
  identity: RightTokenIdentity,
  store: RightTokenMemberStore = defaultStore
): Promise<boolean> {
  return store.redeemJti(identity.jti, identity.expiresAt);
}
