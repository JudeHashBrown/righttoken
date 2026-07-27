export const mailWorkspaceViews = [
  "replies",
  "pending",
  "unsubscribed",
  "mailboxes",
  "unmatched",
  "drafts",
  "failed",
  "sync"
] as const;

export type MailWorkspaceView =
  (typeof mailWorkspaceViews)[number];

export type MailWorkspaceFilter = {
  view: MailWorkspaceView;
  selectedId: string | null;
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
  return {
    view:
      typeof view === "string" &&
      mailWorkspaceViews.includes(view as MailWorkspaceView)
        ? (view as MailWorkspaceView)
        : "replies",
    selectedId:
      typeof selected === "string" && selected.trim()
        ? selected
        : null
  };
}
