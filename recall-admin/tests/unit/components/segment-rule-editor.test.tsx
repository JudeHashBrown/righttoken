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
      currentVersion={3}
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

  it("shows fixed A-G groups and explains AND/OR precedence", () => {
    renderEditor();

    for (const code of ["A", "B", "C", "D", "E", "F", "G"]) {
      expect(
        screen.getByRole("heading", { name: `${code} 组` })
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(/同一分支内的条件是“并且”/)
    ).toBeInTheDocument();
    expect(screen.getByText(/F 始终优先/)).toBeInTheDocument();
    expect(screen.getByText(/G 组为固定兜底组/)).toBeInTheDocument();
  });

  it("allows A-E ordering but keeps F and G locked", () => {
    renderEditor();

    fireEvent.click(
      screen.getByRole("button", { name: "A 组上移" })
    );
    const groupHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent)
      .filter((text) => text?.endsWith(" 组"));

    expect(groupHeadings.slice(0, 3)).toEqual(["F 组", "A 组", "B 组"]);
    expect(
      screen.queryByRole("button", { name: "F 组上移" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "G 组上移" })
    ).not.toBeInTheDocument();
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
      });
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    fireEvent.click(
      screen.getByRole("button", { name: "A 组展开" })
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
        screen.getByText("分组规则 v4 已发布，正在全量重算")
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

    expect(screen.getByText("只读模式")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "预览并发布" }))
      .not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "A 组展开" })
    );
    expect(screen.getByLabelText("A 组注释")).toBeDisabled();
  });
});
