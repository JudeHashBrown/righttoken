// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ServiceAnomalyDetail } from "@/components/users/service-anomaly-detail";

describe("ServiceAnomalyDetail", () => {
  it("shows structured evidence without rendering source messages", () => {
    render(
      <ServiceAnomalyDetail
        anomaly={{
          category: "上游服务异常",
          title: "上游服务异常 · HTTP 502",
          diagnosis: "上游服务错误",
          rawError: "provider_error",
          summary: "近30分钟失败 4/5 · 最近发生 07/23 17:54",
          metadata: ["provider_error", "gpt-5", "openai"],
          taskReason:
            "上游服务异常（HTTP 502），近30分钟5次请求失败4次。"
        }}
      />
    );

    expect(screen.getByText("当前异常")).toBeInTheDocument();
    expect(
      screen.getByText("上游服务异常 · HTTP 502")
    ).toBeInTheDocument();
    expect(screen.getByText("provider_error")).toBeInTheDocument();
    expect(screen.getByText("gpt-5")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(
      screen.queryByText("upstream temporarily unavailable")
    ).not.toBeInTheDocument();
  });
});
