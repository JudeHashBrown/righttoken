import { describe, expect, it } from "vitest";
import { resolveRuntimeRightTokenConfig } from "@/modules/integrations/righttoken/runtime-adapter";

describe("resolveRuntimeRightTokenConfig", () => {
  it("uses an enabled database configuration before environment fallback", () => {
    const stored = { mode: "simulator" };

    expect(
      resolveRuntimeRightTokenConfig(stored, {
        RIGHTTOKEN_API_BASE_URL: "https://righttoken.ai",
        RIGHTTOKEN_API_TOKEN: "t".repeat(32)
      })
    ).toBe(stored);
  });

  it("builds the production HTTP source from environment variables", () => {
    expect(
      resolveRuntimeRightTokenConfig(null, {
        RIGHTTOKEN_API_BASE_URL: "https://righttoken.ai",
        RIGHTTOKEN_API_TOKEN: "t".repeat(32)
      })
    ).toEqual({
      mode: "http",
      baseUrl: "https://righttoken.ai",
      apiToken: "t".repeat(32),
      usersPath: "/api/v1/admin/recall/users"
    });
  });

  it("fails closed when the production source is incomplete", () => {
    expect(
      resolveRuntimeRightTokenConfig(null, {
        RIGHTTOKEN_API_BASE_URL: "https://righttoken.ai"
      })
    ).toBeNull();
  });
});
