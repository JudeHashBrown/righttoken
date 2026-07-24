import styles from "@/components/workspaces/workspace.module.css";
import { MailboxSettingsForm } from "@/components/settings/mailbox-settings-form";
import { MailboxActions } from "@/components/settings/mailbox-actions";
import { WecomSettingsForm } from "@/components/settings/wecom-settings-form";
import { RightTokenSettingsForm } from "@/components/settings/righttoken-settings-form";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getSettingsWorkspaceOverview } from "@/modules/admin/workspace-queries";

export default async function SettingsPage(): Promise<React.JSX.Element> {
  await requireAdministrator("/settings");
  const overview = await getSettingsWorkspaceOverview();

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>系统设置</h1>
          <p>检查数据库、RightToken 数据源、邮箱和企微通道配置状态。</p>
        </div>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>核心服务</h2>
            <p>页面只显示是否配置，不返回密码、密钥或完整连接地址</p>
          </div>
        </div>
        <ul className={styles.list}>
          <li className={styles.listItem}>
            <div>
              <strong>PostgreSQL 数据库</strong>
              <p>用户、任务、规则和审计数据</p>
            </div>
            <span
              className={
                overview.databaseReady
                  ? styles.statusGood
                  : styles.statusDown
              }
            >
              {overview.databaseReady ? "运行正常" : "连接失败"}
            </span>
          </li>
          <li className={styles.listItem}>
            <div>
              <strong>后台与任务 API</strong>
              <p>本地管理台路由和服务端权限</p>
            </div>
            <span className={styles.statusGood}>运行正常</span>
          </li>
        </ul>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>集成连接</h2>
            <p>凭据加密保存，页面只显示连接状态</p>
          </div>
        </div>
        <ul className={styles.list}>
          {overview.integrations.map((integration) => (
            <li className={styles.listItem} key={integration.name}>
              <div>
                <strong>{integration.name}</strong>
                <p>
                  {integration.configured
                    ? "数据源或通知通道已配置"
                    : "等待正式账号或接口信息"}
                </p>
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
              <p>页面只显示邮箱地址和运行状态，不返回密码</p>
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
                      ? `错误：${mailbox.lastErrorCode}`
                      : mailbox.lastSuccessAt
                        ? "最近连接正常"
                        : "尚未测试连接"}
                  </p>
                </div>
                <MailboxActions mailboxId={mailbox.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <MailboxSettingsForm />
      <WecomSettingsForm />
      <RightTokenSettingsForm />
    </main>
  );
}
