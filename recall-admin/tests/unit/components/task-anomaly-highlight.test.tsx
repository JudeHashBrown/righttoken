// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  TaskAnomalyHighlight
} from "@/components/tasks/task-anomaly-highlight";

describe("TaskAnomalyHighlight", () => {
  it("highlights the concrete diagnosis and raw error as text", () => {
    render(
      <TaskAnomalyHighlight
        anomaly={{
          category: "上游服务异常",
          title: "上游服务异常 · HTTP 503",
          diagnosis: "上游无可用账号",
          rawError: "<b>no accounts available</b>",
          summary: "近30分钟失败 4/5",
          metadata: ["provider_error", "gpt-5"],
          taskReason: "上游服务异常。"
        }}
      />
    );

    expect(screen.getByText("具体错误")).toBeInTheDocument();
    expect(screen.getByText("上游无可用账号")).toBeInTheDocument();
    expect(
      screen.getByText("<b>no accounts available</b>")
    ).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
    expect(
      screen.getByText("近30分钟失败 4/5")
    ).toBeInTheDocument();
  });
});
