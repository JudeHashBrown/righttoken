import { describe, expect, it } from "vitest";
import { mailSendRequestSchema } from "@/modules/mail/send-request-schema";

const valid = {
  mailboxId: "mailbox-1",
  userId: "user-1",
  taskId: "task-1",
  recipient: "  Test.User@Example.Test ",
  subject: "RightToken 测试",
  bodyText: "测试邮件正文"
};

describe("mailSendRequestSchema", () => {
  it("normalizes a reviewed recipient", () => {
    expect(mailSendRequestSchema.parse(valid).recipient).toBe(
      "test.user@example.test"
    );
  });

  it("accepts a user without an existing task", () => {
    const { taskId: _taskId, ...withoutTask } = valid;
    const result = mailSendRequestSchema.parse(withoutTask);
    expect(result).toMatchObject({ userId: "user-1" });
    expect(result.taskId).toBeUndefined();
  });

  it("requires a selected RightToken user", () => {
    const { userId: _userId, ...withoutUser } = valid;
    expect(
      mailSendRequestSchema.safeParse(withoutUser).success
    ).toBe(false);
  });

  it.each(["", "not-an-email", "a@"])(
    "rejects invalid recipient %s",
    (recipient) => {
      expect(
        mailSendRequestSchema.safeParse({
          ...valid,
          recipient
        }).success
      ).toBe(false);
    }
  );
});
