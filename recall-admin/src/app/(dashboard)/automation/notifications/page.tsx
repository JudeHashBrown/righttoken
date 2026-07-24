import styles from "@/components/workspaces/workspace.module.css";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getNotificationWorkspaceOverview } from "@/modules/admin/workspace-queries";

const policies = {
  URGENT: {
    label: "紧急",
    channels: "后台、企微群、邮件",
    first: "立即",
    escalation: "15 分钟重提醒；30 分钟升级主管理员"
  },
  IMPORTANT: {
    label: "重要",
    channels: "后台、企微群",
    first: "立即",
    escalation: "按任务 SLA 升级管理员"
  },
  NORMAL: {
    label: "普通",
    channels: "后台、每日企微汇总",
    first: "后台立即",
    escalation: "1 个工作日后升级管理员"
  }
} as const;

export default async function NotificationRulesPage(): Promise<React.JSX.Element> {
  await requireAdministrator("/automation/notifications");
  const counts = await getNotificationWorkspaceOverview();

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
        {counts.map((row) => (
          <div className={styles.statCard} key={row.priority}>
            <span>{policies[row.priority].label}待处理</span>
            <strong>{row.openTasks}</strong>
            <small>{policies[row.priority].channels}</small>
          </div>
        ))}
        <div className={styles.statCard}>
          <span>每日汇总时间</span>
          <strong>10:00</strong>
          <small>Asia/Shanghai</small>
        </div>
      </div>

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
              {Object.entries(policies).map(([priority, policy]) => (
                <tr key={priority}>
                  <td>{policy.label}</td>
                  <td>{policy.channels}</td>
                  <td>{policy.first}</td>
                  <td>{policy.escalation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
