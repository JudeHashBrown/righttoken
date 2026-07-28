import { MailStatLinks } from "@/components/mail/mail-stat-links";
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
  const data = await getMailWorkspaceData(member, filter);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>邮件中心</h1>
          <p>
            查看用户来信、处理待回复会话并维护公共邮件模板。
          </p>
        </div>
      </header>

      <MailStatLinks stats={data.stats} />

      {data.mailboxes.some((mailbox) => mailbox.enabled) ? null : (
        <p className={styles.notice}>
          尚未启用邮箱。请先由管理员在系统设置中连接 Namecheap、企业微信邮箱或自定义 SMTP/IMAP。
        </p>
      )}

      <MailWorkbench data={data} />
    </main>
  );
}
