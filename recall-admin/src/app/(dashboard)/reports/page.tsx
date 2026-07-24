import styles from "@/components/workspaces/workspace.module.css";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getReportWorkspaceOverview } from "@/modules/admin/workspace-queries";

function rate(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default async function ReportsPage(): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/reports");
  const report = await getReportWorkspaceOverview(member);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>数据报表</h1>
          <p>查看注册、支付、活跃、任务和逾期的实时运营指标。</p>
        </div>
        {member.role === "PRIMARY_ADMIN" ? (
          <span className={styles.statusGood}>可导出 CSV</span>
        ) : (
          <span className={styles.status}>在线查看</span>
        )}
      </header>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <span>可见用户</span>
          <strong>{report.users}</strong>
          <small>按当前账号权限范围统计</small>
        </div>
        <div className={styles.statCard}>
          <span>首付转化</span>
          <strong>{rate(report.paidUsers, report.users)}</strong>
          <small>{report.paidUsers} 位用户已完成首付</small>
        </div>
        <div className={styles.statCard}>
          <span>7 日活跃</span>
          <strong>{rate(report.activeUsers, report.users)}</strong>
          <small>{report.activeUsers} 位用户最近成功调用</small>
        </div>
        <div className={styles.statCard}>
          <span>任务逾期率</span>
          <strong>{rate(report.overdueTasks, report.openTasks)}</strong>
          <small>{report.overdueTasks} / {report.openTasks} 个未完成任务</small>
        </div>
      </div>

      <div className={styles.twoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>任务结果</h2>
              <p>当前权限范围内的任务累计</p>
            </div>
          </div>
          <div className={styles.definitionGrid}>
            <div className={styles.definitionItem}>
              <span>未完成任务</span>
              <strong>{report.openTasks}</strong>
            </div>
            <div className={styles.definitionItem}>
              <span>已完成任务</span>
              <strong>{report.completedTasks}</strong>
            </div>
            <div className={styles.definitionItem}>
              <span>已逾期任务</span>
              <strong>{report.overdueTasks}</strong>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>最近操作记录</h2>
              <p>只展示当前账号有权查看的审计摘要</p>
            </div>
          </div>
          {report.audits.length ? (
            <ul className={styles.list}>
              {report.audits.map((audit) => (
                <li className={styles.listItem} key={audit.id}>
                  <div>
                    <strong>{audit.action}</strong>
                    <p>
                      {audit.actor?.displayName || "系统"} ·{" "}
                      {audit.entityType}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <strong>暂无操作记录</strong>
              <p>规则、成员和任务操作会留下不可修改的审计摘要。</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
