import { describe, expect, it } from "vitest";
import {
  presentRunStatus,
  presentTaskOrigin,
  presentTaskPriority,
  presentTaskStatus
} from "@/modules/presentation/status";

describe("presentTaskStatus", () => {
  it("uses operational language for known task states", () => {
    expect(presentTaskStatus("UNASSIGNED")).toBe("待领取");
    expect(presentTaskStatus("IN_PROGRESS")).toBe("处理中");
    expect(presentTaskStatus("WAITING_USER")).toBe("等待用户");
    expect(presentTaskStatus("COMPLETED")).toBe("已完成");
  });

  it("never exposes an unknown task state", () => {
    expect(presentTaskStatus("BACKEND_NEW_STATE")).toBe(
      "状态正在更新"
    );
  });
});

describe("task supporting labels", () => {
  it("translates priority and origin without raw fallbacks", () => {
    expect(presentTaskPriority("URGENT")).toBe("紧急");
    expect(presentTaskPriority("IMPORTANT")).toBe("重要");
    expect(presentTaskPriority("NORMAL")).toBe("普通");
    expect(presentTaskPriority("SYSTEM_PRIORITY")).toBe("普通");

    expect(presentTaskOrigin("AUTOMATION")).toBe("系统发现");
    expect(presentTaskOrigin("MANUAL")).toBe("人工创建");
    expect(presentTaskOrigin("UNKNOWN_ORIGIN")).toBe("运营工作");
  });
});

describe("presentRunStatus", () => {
  it("describes user regrouping in business language", () => {
    expect(presentRunStatus("PENDING")).toBe("等待开始");
    expect(presentRunStatus("RUNNING")).toBe("正在整理用户分组");
    expect(presentRunStatus("COMPLETED")).toBe("整理完成");
    expect(presentRunStatus("PARTIAL_FAILURE")).toBe(
      "部分用户尚未完成"
    );
    expect(presentRunStatus("FAILED")).toBe("未能完成");
  });

  it("never exposes an unknown run state", () => {
    expect(presentRunStatus("QUEUE_STALLED")).toBe("进度正在更新");
  });
});
