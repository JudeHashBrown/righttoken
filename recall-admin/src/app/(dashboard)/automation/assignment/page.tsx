import styles from "@/components/workspaces/workspace.module.css";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getAssignmentWorkspaceOverview } from "@/modules/admin/workspace-queries";

function conditions(value: unknown): string {
  if (!value || typeof value !== "object") return "全部用户";
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length
    ? entries
        .map(([key, item]) =>
          `${key}: ${Array.isArray(item) ? item.join("/") : String(item)}`
        )
        .join("；")
    : "全部用户";
}

export default async function AssignmentRulesPage(): Promise<React.JSX.Element> {
  await requireAdministrator("/automation/assignment");
  const overview = await getAssignmentWorkspaceOverview();

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>分配规则</h1>
          <p>按地区、来源、分组和负载顺序为任务分配运营人员。</p>
        </div>
      </header>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <span>已发布规则</span>
          <strong>{overview.rules.length}</strong>
          <small>按优先级从小到大匹配</small>
        </div>
        <div className={styles.statCard}>
          <span>启用规则</span>
          <strong>
            {overview.rules.filter((rule) => rule.enabled).length}
          </strong>
          <small>停用规则不会参与分配</small>
        </div>
        <div className={styles.statCard}>
          <span>可用成员</span>
          <strong>{overview.members.length}</strong>
          <small>包含管理员和运营人员</small>
        </div>
        <div className={styles.statCard}>
          <span>公共池任务</span>
          <strong>{overview.publicPoolTasks}</strong>
          <small>未命中或等待领取</small>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>当前规则顺序</h2>
            <p>无规则命中时自动进入默认公共任务池</p>
          </div>
        </div>
        {overview.rules.length ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>顺序</th>
                  <th>规则</th>
                  <th>条件</th>
                  <th>主要负责人</th>
                  <th>后备负责人</th>
                  <th>负载上限</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {overview.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.priority}</td>
                    <td>{rule.name}</td>
                    <td>{conditions(rule.conditions)}</td>
                    <td>{rule.assigneeName}</td>
                    <td>{rule.fallbackName}</td>
                    <td>{rule.workloadLimit ?? "不限"}</td>
                    <td>
                      <span
                        className={
                          rule.enabled
                            ? styles.statusGood
                            : styles.statusWaiting
                        }
                      >
                        {rule.enabled ? "启用" : "停用"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <strong>尚未发布分配规则</strong>
            <p>当前所有新任务进入公共任务池，可由运营人员主动领取。</p>
          </div>
        )}
      </section>
    </main>
  );
}
