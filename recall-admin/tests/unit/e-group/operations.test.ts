import { describe, expect, it } from "vitest";
import { carePlanInputSchema, outreachInputSchema } from "@/modules/e-group/operations";

describe("E-group operation inputs", () => {
  it("accepts a WeChat outreach description with optional reason and screenshot", () => {
    expect(outreachInputSchema.parse({
      reason: "预算审批中",
      body: "已通过微信提醒客户余额不足",
      assetId: "asset-1"
    })).toEqual({
      reason: "预算审批中",
      body: "已通过微信提醒客户余额不足",
      assetId: "asset-1"
    });
  });

  it("requires a written outreach process and care plan", () => {
    expect(outreachInputSchema.safeParse({ body: "" }).success).toBe(false);
    expect(carePlanInputSchema.safeParse({ body: "" }).success).toBe(false);
    expect(carePlanInputSchema.parse({ body: "下周一回访并提供阶梯充值方案" })).toEqual({
      body: "下周一回访并提供阶梯充值方案"
    });
  });
});
