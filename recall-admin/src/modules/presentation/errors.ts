const errorCopy: Record<string, string> = {
  IMAP_AUTH_FAILED:
    "邮箱账号、密码或授权未通过，请检查后重新测试连接。",
  IMAP_CONNECTION_TIMEOUT:
    "连接收件邮箱超时，请检查服务器地址和网络后重试。",
  IMAP_TLS_FAILED:
    "邮箱安全连接失败，请检查安全连接设置。",
  IMAP_FOLDER_FAILED:
    "暂时无法读取收件箱，请确认邮箱账号可以正常收信。",
  IMAP_MESSAGE_PARSE_FAILED:
    "部分来信暂时无法读取，其他邮件仍会继续接收。",
  MAIL_SYNC_PROCESSING_FAILED:
    "部分来信尚未整理完成，请稍后重新同步。",
  MAIL_SYNC_FAILED:
    "邮箱收信未完成，请重新测试连接后再试。",
  SMTP_SEND_FAILED:
    "邮件未能发出，请检查发件邮箱连接后重试。",
  WECOM_CONNECTION_FAILED:
    "企业微信通知未能发送，请检查连接信息后重试。",
  RIGHTTOKEN_USER_NOT_FOUND:
    "没有找到对应的主站用户，请确认邮箱填写正确。"
};

export function presentUserError(error: unknown): string {
  if (typeof error === "string") {
    return (
      errorCopy[error] ??
      "暂时无法完成操作，请稍后重试。"
    );
  }
  if (
    error &&
    typeof error === "object" &&
    typeof Reflect.get(error, "code") === "string"
  ) {
    return (
      errorCopy[Reflect.get(error, "code") as string] ??
      "暂时无法完成操作，请稍后重试。"
    );
  }
  return "暂时无法完成操作，请稍后重试。";
}
