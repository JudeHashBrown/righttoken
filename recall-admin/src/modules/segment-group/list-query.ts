import type { MemberRole, Prisma, SegmentCode } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function getSegmentGroupUsers(
  viewer: { id: string; role: MemberRole },
  segment: SegmentCode
) {
  const scope: Prisma.UserProfileWhereInput = viewer.role === "OPERATOR"
    ? { OR: [{ ownerId: viewer.id }, { tasks: { some: { OR: [{ assigneeId: viewer.id }, { assigneeId: null, status: "UNASSIGNED" }] } } }] }
    : {};
  return prisma.userProfile.findMany({
    where: { AND: [{ currentSegment: segment, sourceDeletedAt: null }, scope] },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      externalUserId: true,
      displayName: true,
      email: true,
      countryCode: true,
      lastCallAt: true,
      firstPaidAt: true,
      totalPaidMinor: true,
      balanceCurrency: true
    }
  });
}
