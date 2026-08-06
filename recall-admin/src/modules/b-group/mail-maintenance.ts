import type { MailPurpose } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export function maintenancePurposeEligible(
  purpose: MailPurpose
): boolean {
  return (
    purpose === "KNOWLEDGE_SHARE" ||
    purpose === "PRODUCT_UPDATE"
  );
}

export async function recordMailMaintenance(
  messageId: string
) {
  const message = await prisma.mailMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      userId: true,
      reviewedById: true,
      status: true,
      purpose: true,
      subject: true,
      sentAt: true,
      createdAt: true
    }
  });
  if (
    !message?.userId ||
    message.status !== "SENT" ||
    !maintenancePurposeEligible(message.purpose)
  ) {
    return null;
  }
  const label =
    message.purpose === "KNOWLEDGE_SHARE"
      ? "知识分享"
      : "产品更新";
  return prisma.userMaintenanceRecord.upsert({
    where: { sourceMessageId: message.id },
    create: {
      userId: message.userId,
      actorId: message.reviewedById,
      source: "MAIL",
      sourceMessageId: message.id,
      occurredAt: message.sentAt ?? message.createdAt,
      body: `发送${label}邮件：${message.subject}`
    },
    update: {}
  });
}
