import { describe, expect, it } from "vitest";
import { mailSendRequestSchema } from "@/modules/mail/send-request-schema";

const valid = {
  mailboxId: "mailbox-1",
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
