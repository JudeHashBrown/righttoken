import { afterEach, describe, expect, it, vi } from "vitest";

describe("Prisma client initialization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("can be imported during a production build without runtime database settings", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();

    await expect(import("@/lib/db/prisma")).resolves.toHaveProperty(
      "prisma"
    );
  });
});
