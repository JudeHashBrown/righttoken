import styles from "@/components/workspaces/workspace.module.css";
import { MailboxSettingsForm } from "@/components/settings/mailbox-settings-form";
import { MailboxActions } from "@/components/settings/mailbox-actions";
import { WecomSettingsForm } from "@/components/settings/wecom-settings-form";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getSettingsWorkspaceOverview } from "@/modules/admin/workspace-queries";
import {
  mailSyncStatusText
} from "@/modules/mail/sync-error";

export default async function SettingsPage(): Promise<React.JSX.Element> {
  await requireAdministrator("/settings");
  const overview = await getSettingsWorkspaceOverview();

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>系统设置</h1>
          <p>查看主站数据、客服邮箱和企业微信是否可以正常使用。</p>
        </div>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>基础功能</h2>
            <p>这里只显示使用状态，不会显示密码或完整连接信息</p>
          </div>
        </div>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <div>
              <strong>主站用户数据</strong>
              <p>注册、支付、余额和使用情况</p>
            </div>
            <span
              className={
                overview.databaseReady
                  ? styles.statusGood
                  : styles.statusDown
              }
            >
              {overview.databaseReady ? "可以正常读取" : "暂时无法读取"}
            </span>
          </li>
          <li className={styles.listItem}>
            <div>
              <strong>用户运营功能</strong>
              <p>用户、任务、邮件和团队权限</p>
            </div>
            <span className={styles.statusGood}>运行正常</span>
          </li>
        </ul>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>外部连接</h2>
            <p>账号信息会加密保存，这里只显示连接状态</p>
          </div>
        </div>
        <ul className={styles.list}>
          {overview.integrations.map((integration) => (
            <li className={styles.listItem} key={integration.name}>
              <div>
                <strong>{integration.name}</strong>
                <p>{integration.detail}</p>
              </div>
              <span
                className={
                  integration.configured
                    ? styles.statusGood
                    : styles.statusWaiting
                }
              >
                {integration.configured ? "已配置" : "待配置"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {overview.mailboxes.length ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>已保存邮箱</h2>
              <p>这里只显示邮箱地址和使用状态，不会显示密码</p>
            </div>
          </div>
          <ul className={styles.list}>
            {overview.mailboxes.map((mailbox) => (
              <li className={styles.listItem} key={mailbox.id}>
                <div>
                  <strong>{mailbox.name}</strong>
                  <p>
                    {mailbox.emailAddress}
                    {" · "}
                    {mailbox.lastErrorCode
                      ? mailSyncStatusText(
                          mailbox.lastErrorCode
                        )
                      : mailbox.lastSuccessAt
                        ? "最近连接正常"
                        : "尚未测试连接"}
                  </p>
                </div>
                <MailboxActions
                  mailboxId={mailbox.id}
                  mailboxName={mailbox.name}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MailboxSettingsForm />
      <WecomSettingsForm />
    </main>
  );
}
