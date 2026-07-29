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
    ).toEqual(["全部", "F", "A", "B", "C", "D", "E", "G"]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "F" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "A" })).toHaveAttribute(
      "name",
      "segment"
    );
    expect(screen.getByRole("button", { name: "A" })).toHaveAttribute(
      "value",
      "A"
    );
  });
});
