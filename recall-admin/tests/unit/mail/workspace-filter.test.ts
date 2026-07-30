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
      selectedId: "thread-1",
      compose: false,
      composeUserId: null,
      composeTaskId: null
    });
  });

  it("accepts the standalone template management view", () => {
    expect(
      parseMailWorkspaceFilter({
        view: "templates"
      })
    ).toEqual({
      view: "templates",
      selectedId: null,
      compose: false,
      composeUserId: null,
      composeTaskId: null
    });
  });

  it("accepts the sent-mail view", () => {
    expect(
      parseMailWorkspaceFilter({
        view: "sent",
        selected: "message-1"
      })
    ).toEqual({
      view: "sent",
      selectedId: "message-1",
      compose: false,
      composeUserId: null,
      composeTaskId: null
    });
  });

  it("accepts task-linked compose state", () => {
    expect(
      parseMailWorkspaceFilter({
        view: "replies",
        compose: "1",
        userId: "user-1",
        taskId: "task-1"
      })
    ).toEqual({
      view: "replies",
      selectedId: null,
      compose: true,
      composeUserId: "user-1",
      composeTaskId: "task-1"
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
      selectedId: null,
      compose: false,
      composeUserId: null,
      composeTaskId: null
    });
  });
});
