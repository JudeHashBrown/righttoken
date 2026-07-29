import { describe, expect, it } from "vitest";
import { presentAssignmentReason } from "@/modules/presentation/tasks";

describe("presentAssignmentReason", () => {
  it("turns stored assignment details into team language", () => {
    expect(
      presentAssignmentReason(
        "规则“俄罗斯用户”命中：国家为 RU；负责人当前未完成任务 2/10"
      )
    ).toBe(
      "根据“俄罗斯用户”分配：国家为 RU；负责人当前有 2/10 项待办任务"
    );
    expect(presentAssignmentReason("claimed")).toBe("负责人已领取");
    expect(
      presentAssignmentReason("没有规则命中；进入公共池")
    ).toBe("暂未找到合适负责人，已放入公共任务池");
  });

  it("does not expose an unknown machine-only reason", () => {
    expect(presentAssignmentReason("ASSIGNMENT_ENGINE_FALLBACK")).toBe(
      "系统已根据当前分配设置安排负责人"
    );
  });
});
