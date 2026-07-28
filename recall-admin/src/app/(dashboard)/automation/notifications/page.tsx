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
          <h1>通知策略</h1>
          <p>查看提醒级别、通知渠道、重试和升级规则。</p>
        </div>
      </header>

      <p className={styles.notice}>
        后台通知已生效；企业微信和运营邮箱将在系统设置中完成连接后自动启用。未配置的外部通道不会阻塞任务创建。
      </p>

      <div className={styles.cardGrid}>
        {overview.counts.map((row) => {
          const policy = policies[row.priority];
          const config = overview.config[policy.key];
          const channels = [
            "后台",
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
          <small>Asia/Shanghai</small>
        </div>
      </div>

      <NotificationPolicyEditor initialConfig={overview.config} />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>默认级别矩阵</h2>
            <p>所有外部消息只包含脱敏用户信息</p>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>级别</th>
                <th>通知渠道</th>
                <th>首次提醒</th>
                <th>升级规则</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(policies).map(([priority, policy]) => {
                const config = overview.config[policy.key];
                const channels = [
                  "后台",
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
                    <td>后台立即</td>
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
