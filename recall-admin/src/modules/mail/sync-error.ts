export const mailSyncErrorCodes = [
  "IMAP_AUTH_FAILED",
  "IMAP_CONNECTION_TIMEOUT",
  "IMAP_TLS_FAILED",
  "IMAP_FOLDER_FAILED",
  "IMAP_MESSAGE_PARSE_FAILED",
  "MAIL_SYNC_PROCESSING_FAILED",
  "MAIL_SYNC_FAILED"
] as const;

export type MailSyncErrorCode =
  (typeof mailSyncErrorCodes)[number];

const statusCopy: Record<MailSyncErrorCode, string> = {
  IMAP_AUTH_FAILED: "邮箱账号、密码或授权未通过",
  IMAP_CONNECTION_TIMEOUT: "连接邮箱服务器超时",
  IMAP_TLS_FAILED: "邮箱安全连接失败",
  IMAP_FOLDER_FAILED: "无法读取收件箱",
  IMAP_MESSAGE_PARSE_FAILED: "部分邮件内容无法处理",
  MAIL_SYNC_PROCESSING_FAILED: "邮件保存或任务处理未完成",
  MAIL_SYNC_FAILED: "邮箱同步未完成，请重新测试连接"
};

function errorProperty(
  error: unknown,
  property: string
): unknown {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  return Reflect.get(error, property);
}

function errorCode(error: unknown): string {
  const value = errorProperty(error, "code");
  return typeof value === "string" ? value.toUpperCase() : "";
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message.toUpperCase()
    : "";
}

export function classifyMailSyncError(
  error: unknown
): MailSyncErrorCode {
  const code = errorCode(error);
  const text = errorText(error);
  if (
    errorProperty(error, "authenticationFailed") === true ||
    code.includes("AUTH") ||
    text.includes("AUTHENTICATION")
  ) {
    return "IMAP_AUTH_FAILED";
  }
  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    text.includes("TIMEOUT") ||
    text.includes("TIMED OUT")
  ) {
    return "IMAP_CONNECTION_TIMEOUT";
  }
  if (
    code.includes("CERT") ||
    code.includes("TLS") ||
    text.includes("CERTIFICATE") ||
    text.includes("TLS")
  ) {
    return "IMAP_TLS_FAILED";
  }
  if (
    code === "IMAP_FOLDER_FAILED" ||
    text.includes("MAILBOX DOES NOT EXIST")
  ) {
    return "IMAP_FOLDER_FAILED";
  }
  if (code === "IMAP_MESSAGE_PARSE_FAILED") {
    return "IMAP_MESSAGE_PARSE_FAILED";
  }
  if (code === "MAIL_SYNC_PROCESSING_FAILED") {
    return "MAIL_SYNC_PROCESSING_FAILED";
  }
  return "MAIL_SYNC_FAILED";
}

export function mailSyncStatusText(
  code: string | null
): string {
  if (!code) {
    return "同步正常";
  }
  return (
    statusCopy[code as MailSyncErrorCode] ??
    "邮箱同步未完成，请重新测试连接"
  );
}
