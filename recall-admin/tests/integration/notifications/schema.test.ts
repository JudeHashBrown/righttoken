import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("notification domain schema", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("stores notification intents and encrypted integration credentials", async () => {
    const [intents, credentials] = await Promise.all([
      prisma.notificationIntent.count(),
      prisma.integrationCredential.count()
    ]);
    expect(intents).toEqual(expect.any(Number));
    expect(credentials).toEqual(expect.any(Number));
  });
});
