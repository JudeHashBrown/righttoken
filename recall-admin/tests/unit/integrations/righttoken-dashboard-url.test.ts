import { describe, expect, it } from "vitest";
import { resolveRightTokenDashboardUrl } from "@/modules/integrations/righttoken/dashboard-url";

describe("resolveRightTokenDashboardUrl", () => {
  it("uses the configured URL when provided", () => {
    expect(
      resolveRightTokenDashboardUrl({
        DEPLOYMENT_ENV: "production",
        RIGHTTOKEN_DASHBOARD_URL:
          "https://console.example.com/dashboard"
      })
    ).toBe("https://console.example.com/dashboard");
  });

  it("uses the local dashboard by default in local development", () => {
    expect(
      resolveRightTokenDashboardUrl({
        DEPLOYMENT_ENV: "local"
      })
    ).toBe("http://127.0.0.1:3002/dashboard");
  });

  it("uses the RightToken dashboard by default in production", () => {
    expect(
      resolveRightTokenDashboardUrl({
        DEPLOYMENT_ENV: "production"
      })
    ).toBe("https://righttoken.ai/dashboard");
  });
});
