import styles from "@/components/workspaces/workspace.module.css";
import { NotificationPolicyEditor } from "@/components/automation/notification-policy-editor";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getNotificationWorkspaceOverview } from "@/modules/admin/workspace-queries";

const policies = {
  URGENT: {
    label: "紧急",
    key: "urgent"
  },
  IMPORTANT: {
    label: "重要",
    key: "important"
  },
  NORMAL: {
    label: "普通",
    key: "normal"
  }
} as const;

export default async function NotificationRulesPage(): Promise<React.JSX.Element> {
  await requireAdministrator("/automation/notifications");
  const overview = await getNotificationWorkspaceOverview();

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>提醒设置</h1>
          <p>设置不同紧急程度的提醒方式、再次提醒和负责人升级。</p>
        </div>
      </header>

      <p className={styles.notice}>
        站内提醒始终可用；企业微信和运营邮箱连接后会自动启用。即使暂未连接，也不会影响任务创建。
      </p>

      <div className={styles.cardGrid}>
        {overview.counts.map((row) => {
          const policy = policies[row.priority];
          const config = overview.config[policy.key];
          const channels = [
            "站内",
            config.wecom ? "企微" : null,
            config.email ? "邮件" : null
          ]
            .filter(Boolean)
            .join("、");
          return (
            <div className={styles.statCard} key={row.priority}>
              <span>{policy.label}待处理</span>
              <strong>{row.openTasks}</strong>
              <small>{channels}</small>
            </div>
          );
        })}
        <div className={styles.statCard}>
          <span>每日汇总时间</span>
          <strong>{overview.config.dailyDigestTime}</strong>
          <small>北京时间</small>
        </div>
      </div>

      <NotificationPolicyEditor initialConfig={overview.config} />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>各级别提醒方式</h2>
            <p>发送到企业微信和邮箱的内容会隐藏敏感用户信息</p>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>级别</th>
                <th>通知渠道</th>
                <th>首次提醒</th>
                <th>管理员提醒</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(policies).map(([priority, policy]) => {
                const config = overview.config[policy.key];
                const channels = [
                  "站内",
                  config.wecom ? "企微" : null,
                  config.email ? "邮件" : null
                ]
                  .filter(Boolean)
                  .join("、");
                const escalation = [
                  config.repeatMinutes
                    ? `${config.repeatMinutes} 分钟后重提醒`
                    : "不重复提醒",
                  config.escalateMinutes
                    ? `${config.escalateMinutes} 分钟后升级管理员`
                    : "不自动升级"
                ].join("；");
                return (
                  <tr key={priority}>
                    <td>{policy.label}</td>
                    <td>{channels}</td>
                    <td>立即在站内提醒</td>
                    <td>{escalation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
