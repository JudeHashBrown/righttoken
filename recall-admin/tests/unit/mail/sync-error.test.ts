import { describe, expect, it } from "vitest";
import {
  classifyMailSyncError,
  mailboxSyncStatusText,
  mailSyncStatusText
} from "@/modules/mail/sync-error";

describe("mail sync error classification", () => {
  it.each([
    [{ authenticationFailed: true }, "IMAP_AUTH_FAILED"],
    [
      Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
      "IMAP_CONNECTION_TIMEOUT"
    ],
    [
      Object.assign(new Error("certificate"), {
        code: "CERT_HAS_EXPIRED"
      }),
      "IMAP_TLS_FAILED"
    ],
    [
      Object.assign(new Error("mailbox missing"), {
        code: "IMAP_FOLDER_FAILED"
      }),
      "IMAP_FOLDER_FAILED"
    ],
    [
      Object.assign(new Error("parse"), {
        code: "IMAP_MESSAGE_PARSE_FAILED"
      }),
      "IMAP_MESSAGE_PARSE_FAILED"
    ],
    [
      Object.assign(new Error("database"), {
        code: "MAIL_SYNC_PROCESSING_FAILED"
      }),
      "MAIL_SYNC_PROCESSING_FAILED"
    ]
  ])("classifies %o as %s", (error, expected) => {
    expect(classifyMailSyncError(error)).toBe(expected);
  });

  it("uses a safe fallback and operational Chinese copy", () => {
    expect(classifyMailSyncError(new Error("unknown"))).toBe(
      "MAIL_SYNC_FAILED"
    );
    expect(mailSyncStatusText("MAIL_SYNC_FAILED")).toBe(
      "邮箱同步未完成，请重新测试连接"
    );
    expect(mailSyncStatusText(null)).toBe("同步正常");
  });

  it("never exposes unknown provider errors in frontend copy", () => {
    expect(mailSyncStatusText("SECRET_PROVIDER_FAILURE")).toBe(
      "邮箱同步未完成，请重新测试连接"
    );
  });
});

describe("mailbox sync status", () => {
  const now = new Date("2026-08-01T05:00:00.000Z");

  it("reports a mailbox that has never synchronized", () => {
    expect(
      mailboxSyncStatusText({
        lastErrorCode: null,
        lastSyncedAt: null,
        now
      })
    ).toBe("尚未运行同步，请点击立即收取邮件");
  });

  it("warns when automatic synchronization is stale", () => {
    expect(
      mailboxSyncStatusText({
        lastErrorCode: null,
        lastSyncedAt: new Date("2026-08-01T04:49:59.999Z"),
        now
      })
    ).toBe("自动同步可能未运行，请检查后台 Worker");
  });

  it("reports a recent synchronization as healthy", () => {
    expect(
      mailboxSyncStatusText({
        lastErrorCode: null,
        lastSyncedAt: new Date("2026-08-01T04:52:00.000Z"),
        now
      })
    ).toBe("同步正常");
  });

  it("prioritizes a classified error over synchronization time", () => {
    expect(
      mailboxSyncStatusText({
        lastErrorCode: "IMAP_AUTH_FAILED",
        lastSyncedAt: new Date("2026-08-01T04:59:00.000Z"),
        now
      })
    ).toBe("邮箱账号、密码或授权未通过");
  });
});
