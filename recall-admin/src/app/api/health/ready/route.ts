import { createReadyHandler } from "@/modules/health/ready-handler";

async function probeDatabase(): Promise<unknown> {
  const { prisma } = await import("@/lib/db/prisma");
  return prisma.$queryRawUnsafe("SELECT 1");
}

export const GET = createReadyHandler(probeDatabase);
