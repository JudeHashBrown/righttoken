import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  rightTokenPrisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  });
}

export const prisma =
  globalForPrisma.rightTokenPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.rightTokenPrisma = prisma;
}
