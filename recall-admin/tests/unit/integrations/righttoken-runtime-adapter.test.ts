import { describe, expect, it } from "vitest";
import { resolveRuntimeRightTokenConfig } from "@/modules/integrations/righttoken/runtime-adapter";

describe("resolveRuntimeRightTokenConfig", () => {
  it("uses the simulator only when local mode explicitly selects it", () => {
    expect(
      resolveRuntimeRightTokenConfig(null, {
        RIGHTTOKEN_SOURCE_MODE: "simulator"
      })
    ).toEqual({ mode: "simulator" });
  });

  it("forces shared database mode ahead of a stale stored HTTP source", () => {
    expect(
      resolveRuntimeRightTokenConfig(
        {
          mode: "http",
          baseUrl: "https://righttoken.ai",
          apiToken: "t".repeat(32)
        },
        {
          RIGHTTOKEN_SOURCE_MODE: "database"
        }
      )
    ).toEqual({ mode: "database" });
  });

  it("does not revive a stale stored HTTP source", () => {
    expect(
      resolveRuntimeRightTokenConfig(
        {
          mode: "http",
          baseUrl: "https://righttoken.ai",
          apiToken: "t".repeat(32)
        },
        {}
      )
    ).toBeNull();
  });
});
