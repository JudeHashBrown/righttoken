import Link from "next/link";
import { MailStatLinks } from "@/components/mail/mail-stat-links";
import {
  MailTemplateLibrary
} from "@/components/mail/mail-template-library";
import { MailComposer } from "@/components/mail/mail-composer";
import {
  MailBatchList
} from "@/components/mail/mail-batch-list";
import { MailWorkbench } from "@/components/mail/mail-workbench";
import styles from "@/components/workspaces/workspace.module.css";
import {
  requireWorkspaceMember
} from "@/modules/admin/page-access";
import {
  parseMailWorkspaceFilter
} from "@/modules/mail/workspace-filter";
import {
  getMailWorkspaceData
} from "@/modules/mail/workspace-query";
import {
  findComposeUsers,
  getComposeContext
} from "@/modules/mail/compose-context";

type MailPageProps = {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

export default async function MailPage({
  searchParams
}: MailPageProps): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/mail");
  const filter = parseMailWorkspaceFilter(await searchParams);
  const [data, initialUsers, composeContext] =
    await Promise.all([
      getMailWorkspaceData(member, filter),
      filter.compose
        ? findComposeUsers(member, "")
        : Promise.resolve([]),
      filter.compose
        ? getComposeContext(member, {
            userId: filter.composeUserId,
            taskId: filter.composeTaskId
          })
        : Promise.resolve({
            selectedUser: null,
            selectedTask: null
          })
    ]);
  const composeUsers = composeContext.selectedUser
    ? [
        composeContext.selectedUser,
        ...initialUsers.filter(
          (user) =>
            user.id !== composeContext.selectedUser?.id
        )
      ]
    : initialUsers;
  const composeTasks =
    composeContext.selectedTask &&
    composeContext.selectedUser
      ? [
          {
            id: composeContext.selectedTask.id,
            userId: composeContext.selectedUser.id,
            title: composeContext.selectedTask.title,
            userLabel: composeContext.selectedUser.label,
            recipient: composeContext.selectedUser.email,
            suppressed:
              composeContext.selectedUser.suppressed
          }
        ]
      : [];

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>邮件中心</h1>
          <p>
            查看用户来信、处理待回复会话并维护公共邮件模板。
          </p>
        </div>
        <div className={styles.headingActions}>
          {filter.view === "templates" ? null : (
            <Link
              className={styles.button}
              href={`/mail?view=${filter.view}&compose=1`}
            >
              写邮件
            </Link>
          )}
          <Link
            className={styles.secondaryButton}
            href={
              filter.view === "templates"
                ? "/mail?view=replies"
                : "/mail?view=templates"
            }
          >
            {filter.view === "templates"
              ? "返回邮件列表"
              : "模板管理"}
          </Link>
        </div>
      </header>

      {filter.view === "templates" ? (
        <MailTemplateLibrary
          key={data.templates
            .map((template) => template.id)
            .join(":")}
          templates={data.templates}
        />
      ) : (
        <>
          {filter.compose ? (
            <MailComposer
              tasks={composeTasks}
              users={composeUsers}
              mailboxes={data.mailboxes
                .filter((mailbox) => mailbox.enabled)
                .map((mailbox) => ({
                  id: mailbox.id,
                  name: mailbox.name,
                  emailAddress: mailbox.emailAddress
                }))}
              templates={data.templates
                .filter((template) => template.active)
                .map((template) => ({
                  id: template.id,
                  name: template.name,
                  subject: template.subject,
                  bodyText: template.bodyText,
                  bodyHtml: template.bodyHtml,
                  assets: template.assets
                }))}
              initialUserId={
                composeContext.selectedUser?.id ?? null
              }
              initialTaskId={
                composeContext.selectedTask?.id ?? null
              }
              initialSubject=""
              initialBody=""
              closeHref={`/mail?view=${filter.view}`}
            />
          ) : null}

          <MailBatchList batches={data.mailBatches} />

          <MailStatLinks stats={data.stats} />

          {data.mailboxes.some((mailbox) => mailbox.enabled) ? null : (
            <p className={styles.notice}>
              尚未启用客服邮箱。请先由管理员在系统设置中连接企业微信邮箱或其他 SMTP/IMAP 邮箱。
            </p>
          )}

          <MailWorkbench data={data} />
        </>
      )}
    </main>
  );
}
