import { describe, expect, it } from "vitest";
import { checkReadiness } from "@/modules/health/readiness";

describe("checkReadiness", () => {
  it("reports ready when the dependency probe succeeds", async () => {
    await expect(
      checkReadiness(async () => "ok")
    ).resolves.toEqual({ ready: true });
  });

  it("reports unavailable without exposing the dependency error", async () => {
    const result = await checkReadiness(async () => {
      throw new Error(
        "postgresql://secret-user:secret-password@recall-db/private"
      );
    });

    expect(result).toEqual({ ready: false });
    expect(JSON.stringify(result)).not.toContain("secret-password");
  });
});
