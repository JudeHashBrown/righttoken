import { describe, expect, it } from "vitest";
import { presentSegmentReason } from "@/modules/segmentation/present-reason";

describe("presentSegmentReason", () => {
  it("cleans historical technical rule language before rendering it", () => {
    expect(
      presentSegmentReason(
        "RightToken user reconciliation: 如果首次支付时间不为空，并且成功调用次数大于 0，并且美元等值余额（美分）小于 50，则进入 E 组。"
      )
    ).toBe(
      "自动重新分组：如果已完成首单，并且已有成功调用，并且余额低于 0.50 美元，则进入 E 组。"
    );
    expect(
      presentSegmentReason(
        "RightToken user reconciliation: 如果首次支付时间为空，并且是否进入支付等于 是，则进入 B 组。"
      )
    ).toBe(
      "自动重新分组：如果尚未完成首单，并且已进入支付流程，则进入 B 组。"
    );
  });
});
