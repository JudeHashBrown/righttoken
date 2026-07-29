import { describe, expect, it } from "vitest";
import { presentUserError } from "@/modules/presentation/errors";

describe("presentUserError", () => {
  it("gives an actionable message for known connection errors", () => {
    expect(presentUserError("IMAP_AUTH_FAILED")).toBe(
      "邮箱账号、密码或授权未通过，请检查后重新测试连接。"
    );
    expect(presentUserError("SMTP_SEND_FAILED")).toBe(
      "邮件未能发出，请检查发件邮箱连接后重试。"
    );
  });

  it("never exposes unknown error codes or exception messages", () => {
    expect(presentUserError("POSTGRES_CONNECTION_REFUSED")).toBe(
      "暂时无法完成操作，请稍后重试。"
    );
    expect(
      presentUserError(new Error("relation users does not exist"))
    ).toBe("暂时无法完成操作，请稍后重试。");
  });
});
