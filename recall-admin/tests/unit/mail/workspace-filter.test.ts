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
      batchHistory: false,
      composeUserId: null,
      composeTaskId: null,
      composeRetryMessageId: null
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
      batchHistory: false,
      composeUserId: null,
      composeTaskId: null,
      composeRetryMessageId: null
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
      batchHistory: false,
      composeUserId: null,
      composeTaskId: null,
      composeRetryMessageId: null
    });
  });

  it("accepts task-linked compose state", () => {
    expect(
      parseMailWorkspaceFilter({
        view: "replies",
        compose: "1",
        userId: "user-1",
        taskId: "task-1",
        retryMessageId: "message-1"
      })
    ).toEqual({
      view: "replies",
      selectedId: null,
      compose: true,
      batchHistory: false,
      composeUserId: "user-1",
      composeTaskId: "task-1",
      composeRetryMessageId: "message-1"
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
      batchHistory: false,
      composeUserId: null,
      composeTaskId: null,
      composeRetryMessageId: null
    });
  });

  it("opens batch history only when explicitly requested", () => {
    expect(
      parseMailWorkspaceFilter({
        view: "sent",
        batchHistory: "1"
      })
    ).toMatchObject({
      view: "sent",
      batchHistory: true
    });
  });
});
