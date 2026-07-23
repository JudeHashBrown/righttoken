import { prisma } from "@/lib/db/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function handlePiiRetention(
  now = new Date(),
  auditRetentionDays = 2 * 365
) {
  const piiCutoff = new Date(now.getTime() - 180 * DAY_MS);
  const auditCutoff = new Date(
    now.getTime() - auditRetentionDays * DAY_MS
  );
  const [cleared, deletedAudits] = await prisma.$transaction([
    prisma.userProfile.updateMany({
      where: {
        registeredAt: { lt: piiCutoff },
        registrationIpEnc: { not: null }
      },
      data: { registrationIpEnc: null }
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } }
    })
  ]);
  return {
    piiFieldsCleared: cleared.count,
    auditRecordsDeleted: deletedAudits.count
  };
}
