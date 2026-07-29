export const mailWorkspaceViews = [
  "replies",
  "pending",
  "unsubscribed",
  "mailboxes",
  "unmatched",
  "drafts",
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
  composeUserId: string | null;
  composeTaskId: string | null;
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
  const userId = searchParams.userId;
  const taskId = searchParams.taskId;
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
    composeUserId:
      typeof userId === "string" && userId.trim()
        ? userId
        : null,
    composeTaskId:
      typeof taskId === "string" && taskId.trim()
        ? taskId
        : null
  };
}
