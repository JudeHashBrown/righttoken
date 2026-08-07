export function mailComposeHref(input: {
  userId: string;
  taskId?: string | null;
  retryMessageId?: string | null;
  view?: string;
}): string {
  const params = new URLSearchParams();
  params.set("view", input.view ?? "replies");
  params.set("compose", "1");
  params.set("userId", input.userId);
  if (input.taskId) {
    params.set("taskId", input.taskId);
  }
  if (input.retryMessageId) {
    params.set("retryMessageId", input.retryMessageId);
  }
  return `/mail?${params.toString()}`;
}
