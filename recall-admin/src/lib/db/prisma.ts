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
    adapter: new PrismaPg(
      { connectionString },
      { schema: "recall" }
    )
  });
}

function getPrismaClient(): PrismaClient {
  const cachedClient = globalForPrisma.rightTokenPrisma;
  if (cachedClient) {
    return cachedClient;
  }

  const client = createPrismaClient();
  globalForPrisma.rightTokenPrisma = client;
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  }
});
