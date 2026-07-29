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
import { AssignmentRuleEditor } from "@/components/automation/assignment-rule-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("AssignmentRuleEditor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("adds rules and previews the current draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sampledUsers: 83,
          countsByRule: { "draft:1": 50 },
          countsByAssignee: { "member-1": 50 },
          publicPool: 33,
          unmatchedConditions: 33
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AssignmentRuleEditor
        initialRules={[
          {
            id: "rule-1",
            name: "新加坡用户",
            enabled: true,
            priority: 1,
            countryCodes: "SG",
            regions: "Central Region",
            sources: "",
            segments: ["A", "B"],
            assigneeId: "member-1",
            fallbackAssigneeId: "",
            poolKey: "",
            workloadLimit: "20"
          }
        ]}
        members={[
          {
            id: "member-1",
            displayName: "林小雨",
            role: "OPERATOR",
            openTasks: 4
          }
        ]}
      />
    );

    expect(screen.getByDisplayValue("新加坡用户")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Central Region")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增分配条件" }));
    expect(screen.getAllByLabelText("分配条件名称")).toHaveLength(2);
    fireEvent.change(screen.getAllByLabelText("分配条件名称")[1]!, {
      target: { value: "美国用户" }
    });

    fireEvent.click(screen.getByRole("button", { name: "预览分配" }));
    await waitFor(() => {
      expect(screen.getByText("已查看最近 83 位用户")).toBeInTheDocument();
      expect(screen.getByText("由主管理员暂管 33 人")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/automation/assignment-rules/preview",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"regionIncludes":["Central Region"]')
      })
    );
  });

  it("requires a named rule before publishing", () => {
    render(
      <AssignmentRuleEditor initialRules={[]} members={[]} />
    );

    fireEvent.click(screen.getByRole("button", { name: "新增分配条件" }));
    expect(
      screen.getByRole("button", { name: "保存分配方案" })
    ).toBeDisabled();
  });
});
