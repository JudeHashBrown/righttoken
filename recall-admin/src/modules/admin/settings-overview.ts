export function buildMailboxIntegrationSummary(
  mailboxes: Array<{ enabled: boolean }>
): {
  name: "客服邮箱";
  configured: boolean;
  detail: string;
} {
  if (mailboxes.length === 0) {
    return {
      name: "客服邮箱",
      configured: false,
      detail: "尚未添加邮箱"
    };
  }

  const enabled = mailboxes.filter(
    (mailbox) => mailbox.enabled
  ).length;
  return {
    name: "客服邮箱",
    configured: true,
    detail: `已添加 ${mailboxes.length} 个邮箱，${enabled} 个已启用`
  };
}

export function buildMailboxChannelHealth(
  mailboxes: Array<{ enabled: boolean }>
): {
  channel: "客服邮箱";
  state: "healthy" | "warning";
  detail: string;
} {
  const enabled = mailboxes.filter(
    (mailbox) => mailbox.enabled
  ).length;
  if (enabled === 0) {
    return {
      channel: "客服邮箱",
      state: "warning",
      detail:
        mailboxes.length === 0
          ? "尚未添加邮箱"
          : "尚未启用邮箱"
    };
  }
  return {
    channel: "客服邮箱",
    state: "healthy",
    detail: `${enabled} 个邮箱可用`
  };
}
