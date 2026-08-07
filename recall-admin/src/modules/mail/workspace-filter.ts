export const mailWorkspaceViews = [
  "replies",
  "pending",
  "unsubscribed",
  "mailboxes",
  "unmatched",
  "drafts",
  "sent",
  "failed",
  "sync",
  "templates"
] as const;

export type MailWorkspaceView =
  (typeof mailWorkspaceViews)[number];

export type MailWorkspaceFilter = {
  view: MailWorkspaceView;
  selectedId: string | null;
  compose: boolean;
  batchHistory: boolean;
  composeUserId: string | null;
  composeTaskId: string | null;
  composeRetryMessageId: string | null;
};

type SearchParams = Record<
  string,
  string | string[] | undefined
>;

export function parseMailWorkspaceFilter(
  searchParams: SearchParams
): MailWorkspaceFilter {
  const view = searchParams.view;
  const selected = searchParams.selected;
  const compose = searchParams.compose;
  const batchHistory = searchParams.batchHistory;
  const userId = searchParams.userId;
  const taskId = searchParams.taskId;
  const retryMessageId = searchParams.retryMessageId;
  return {
    view:
      typeof view === "string" &&
      mailWorkspaceViews.includes(view as MailWorkspaceView)
        ? (view as MailWorkspaceView)
        : "replies",
    selectedId:
      typeof selected === "string" && selected.trim()
        ? selected
        : null,
    compose: compose === "1",
    batchHistory: batchHistory === "1",
    composeUserId:
      typeof userId === "string" && userId.trim()
        ? userId
        : null,
    composeTaskId:
      typeof taskId === "string" && taskId.trim()
        ? taskId
        : null,
    composeRetryMessageId:
      typeof retryMessageId === "string" &&
      retryMessageId.trim()
        ? retryMessageId
        : null
  };
}
