import { prisma } from "@/lib/db/prisma";

export type LatestOutboundContact = {
  status: "SENT" | "BOUNCED";
  sentAt: Date;
};

export async function findLatestOutboundContact(
  userId: string
): Promise<LatestOutboundContact | null> {
  const message = await prisma.mailMessage.findFirst({
    where: {
      userId,
      direction: "OUTBOUND",
      status: { in: ["SENT", "BOUNCED"] },
      sentAt: { not: null }
    },
    orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    select: { status: true, sentAt: true }
  });
  return message?.sentAt &&
    (message.status === "SENT" || message.status === "BOUNCED")
    ? { status: message.status, sentAt: message.sentAt }
    : null;
}
