// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SegmentQuickFilter } from "@/components/users/segment-quick-filter";

describe("SegmentQuickFilter", () => {
  afterEach(cleanup);

  it("shows every segment as an always-visible submit button", () => {
    render(<SegmentQuickFilter selectedSegment="F" />);

    expect(
      screen.getAllByRole("button").map((button) => button.textContent)
    ).toEqual([
      "全部全部用户",
      "F服务异常",
      "A仅注册",
      "B未完成支付",
      "C充值未调用",
      "D长期未调用",
      "E余额不足",
      "G健康或其他"
    ]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "F 服务异常" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "A 仅注册" })
    ).toHaveAttribute("name", "segment");
    expect(
      screen.getByRole("button", { name: "A 仅注册" })
    ).toHaveAttribute("value", "A");
    expect(
      screen.getByRole("button", { name: "G 健康或其他" })
    ).toBeVisible();
  });
});
