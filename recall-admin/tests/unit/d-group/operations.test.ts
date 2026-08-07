import { describe, expect, it } from "vitest";
import { guidanceRecordSchema, inactivityReasonSchema } from "@/modules/d-group/operations";

describe("D-group operation inputs", () => {
  it("records a manual reason including forgotten-platform cases", () => {
    expect(inactivityReasonSchema.parse({ body: "客户充值后忘记了平台的存在" })).toEqual({
      body: "客户充值后忘记了平台的存在"
    });
  });

  it.each(["GROUP_GUIDANCE", "TUTORIAL", "PERSONALIZED_PROMOTION"] as const)(
    "accepts %s guidance records",
    (category) => {
      expect(guidanceRecordSchema.parse({ category, body: "已完成本次详细辅导" })).toEqual({
        category,
        body: "已完成本次详细辅导"
      });
    }
  );

  it("rejects empty manual records", () => {
    expect(inactivityReasonSchema.safeParse({ body: "" }).success).toBe(false);
    expect(guidanceRecordSchema.safeParse({ category: "TUTORIAL", body: "" }).success).toBe(false);
  });
});
