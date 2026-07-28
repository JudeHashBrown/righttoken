// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SegmentRuleEditor } from "@/components/automation/segment-rule-editor";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";
import { getPublicSegmentFieldRegistry } from "@/modules/segmentation/field-registry";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

function renderEditor(canEdit = true) {
  return render(
    <SegmentRuleEditor
      canEdit={canEdit}
      distribution={{
        A: 12,
        B: 8,
        C: 6,
        D: 4,
        E: 3,
        F: 1,
        G: 20
      }}
      fieldRegistry={getPublicSegmentFieldRegistry()}
      initialRuleSet={structuredClone(defaultSegmentRuleSet)}
    />
  );
}

describe("SegmentRuleEditor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the operational group rail without exposing implementation documentation", () => {
    renderEditor();

    const rail = screen.getByRole("group", { name: "用户分组导航" });
    expect(rail).toHaveTextContent("F");
    expect(rail).toHaveTextContent("A");
    expect(rail).toHaveTextContent("B");
    expect(rail).toHaveTextContent("C");
    expect(rail).toHaveTextContent("D");
    expect(rail).toHaveTextContent("E");
    expect(rail).toHaveTextContent("G");
    expect(rail.querySelectorAll("em")).toHaveLength(0);
    expect(
      screen.queryByText("互斥分配逻辑")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/同一分支内的条件是“并且”/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/F 始终优先/)).not.toBeInTheDocument();
    expect(screen.queryByText(/固定兜底/)).not.toBeInTheDocument();
    expect(screen.getByText(/筛选条件（/)).toBeInTheDocument();
    expect(rail).toHaveTextContent("存在服务异常，需要紧急人工介入");
    expect(rail).toHaveTextContent("注册后尚未进入支付流程");
    expect(rail).toHaveTextContent("已进入支付流程但尚未完成首单");
    expect(rail).toHaveTextContent("已完成首单但尚未产生成功调用");
    expect(rail).toHaveTextContent("曾成功调用、有余额但已长期未调用");
    expect(rail).toHaveTextContent(
      "余额不足（低于 0.5 美元或等值货币）或耗尽、等待复充"
    );
    expect(rail).toHaveTextContent("未命中召回条件的健康或其他用户");
    expect(rail).not.toHaveTextContent(/\btrue\b|\bfalse\b/);
    expect(rail).not.toHaveTextContent(/是否存在|是否进入|为空|不为空/);
    expect(rail).not.toHaveTextContent(/美元等值余额|距离最后调用时间/);

    expect(
      screen.getByLabelText("F 组分支 1条件 1字段")
        .querySelector("option:checked")
    ).toHaveTextContent("异常 · 服务异常");
    expect(
      screen.getAllByLabelText("判断")[0]?.querySelector(
        "option:checked"
      )
    ).toHaveTextContent("为");
    expect(
      screen.getAllByLabelText("值")[0]?.querySelector(
        "option:checked"
      )
    ).toHaveTextContent("存在");
  });

  it("allows A-E ordering but keeps F and G locked", () => {
    renderEditor();

    const rail = screen.getByRole("group", { name: "用户分组导航" });
    expect(rail.querySelectorAll("button")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: "F 组上移" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "G 组上移" })).not.toBeInTheDocument();
  });

  it("previews the exact draft before publishing it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalUsers: 54,
            distribution: {
              A: 10,
              B: 8,
              C: 6,
              D: 4,
              E: 4,
              F: 2,
              G: 20
            },
            migrations: 5,
            overlapUsers: 2,
            fallbackUsers: 20,
            tasksToCancel: 3,
            tasksToCreate: 4,
            urgentTasksToCreate: 2,
            samples: [],
            token: "signed-preview-token",
            expiresAt: "2026-07-24T13:00:00.000Z"
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ version: 4, runId: "run-1" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            run: {
              status: "COMPLETED",
              totalUsers: 54,
              processedUsers: 54,
              succeededUsers: 54,
              failedUsers: 0
            }
          })
      });
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    fireEvent.click(
      screen.getByRole("button", { name: /^A12 人/ })
    );
    fireEvent.change(screen.getByLabelText("A 组注释"), {
      target: { value: "注册后尚未支付的重点用户" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "预览并发布" })
    );

    expect(
      await screen.findByText("预计迁移 5 人")
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("本次变更说明"), {
      target: { value: "优化 A 组运营范围" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认发布新版本" })
    );

    await waitFor(() => {
      expect(
        screen.getByText("版本 v4 已发布，正在更新用户分组")
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/automation/segment-rules/preview",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("注册后尚未支付的重点用户")
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/automation/segment-rules",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": expect.any(String)
        }),
        body: expect.stringContaining("signed-preview-token")
      })
    );
  });

  it("renders operators as read-only viewers", () => {
    renderEditor(false);

    expect(screen.queryByText("只读模式")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预览并发布" }))
      .not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /^A12 人/ })
    );
    expect(screen.getByLabelText("A 组注释")).toBeDisabled();
  });
});
