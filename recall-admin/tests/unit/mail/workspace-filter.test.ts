import { describe, expect, it } from "vitest";
import {
  parseMailWorkspaceFilter
} from "@/modules/mail/workspace-filter";

describe("mail workspace filter", () => {
  it("accepts a known view and selected item", () => {
    expect(
      parseMailWorkspaceFilter({
        view: "pending",
        selected: "thread-1"
      })
    ).toEqual({
      view: "pending",
      selectedId: "thread-1"
    });
  });

  it("falls back safely for unknown or repeated values", () => {
    expect(
      parseMailWorkspaceFilter({
        view: "not-valid",
        selected: ["thread-1", "thread-2"]
      })
    ).toEqual({
      view: "replies",
      selectedId: null
    });
  });
});
