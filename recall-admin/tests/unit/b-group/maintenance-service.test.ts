import { describe, expect, it } from "vitest";
import {
  maintenanceInputSchema,
  shanghaiDateToUtc
} from "@/modules/b-group/maintenance-service";
import { maintenancePurposeEligible } from "@/modules/b-group/mail-maintenance";

describe("B-group maintenance rules", () => {
  it("accepts a dated manual maintenance entry", () => {
    expect(
      maintenanceInputSchema.parse({
        occurredOn: "2026-08-06",
        body: " 用户表示周五再尝试支付 "
      })
    ).toEqual({
      occurredOn: "2026-08-06",
      body: "用户表示周五再尝试支付"
    });
  });

  it("stores a Shanghai calendar date at local noon", () => {
    expect(shanghaiDateToUtc("2026-08-06").toISOString()).toBe(
      "2026-08-06T04:00:00.000Z"
    );
  });

  it("counts only knowledge and product-update mail", () => {
    expect(maintenancePurposeEligible("KNOWLEDGE_SHARE")).toBe(true);
    expect(maintenancePurposeEligible("PRODUCT_UPDATE")).toBe(true);
    expect(maintenancePurposeEligible("PAYMENT_FOLLOW_UP")).toBe(false);
    expect(maintenancePurposeEligible("CAMPAIGN")).toBe(false);
  });
});
