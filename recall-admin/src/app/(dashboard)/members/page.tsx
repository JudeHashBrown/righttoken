import styles from "@/components/workspaces/workspace.module.css";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getMemberWorkspaceOverview } from "@/modules/admin/workspace-queries";

const roleLabels = {
  PRIMARY_ADMIN: "主管理员",
  ADMIN: "管理员",
  OPERATOR: "运营人员"
} as const;

export default async function MembersPage(): Promise<React.JSX.Element> {
  const viewer = await requireAdministrator("/members");
  const members = await getMemberWorkspaceOverview();

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>成员与权限</h1>
          <p>查看管理员、运营人员、二次验证和当前工作负载。</p>
        </div>
        <span className={styles.statusGood}>
          {roleLabels[viewer.role]}
        </span>
      </header>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <span>全部成员</span>
          <strong>{members.length}</strong>
          <small>包含停用账号</small>
        </div>
        <div className={styles.statCard}>
          <span>管理员</span>
          <strong>
            {members.filter((item) => item.role !== "OPERATOR").length}
          </strong>
          <small>主管理员和普通管理员</small>
        </div>
        <div className={styles.statCard}>
          <span>运营人员</span>
          <strong>
            {members.filter((item) => item.role === "OPERATOR").length}
          </strong>
          <small>按用户和任务范围访问</small>
        </div>
        <div className={styles.statCard}>
          <span>已启用二次验证</span>
          <strong>
            {members.filter((item) => item.twoFactorOn).length}
          </strong>
          <small>管理员正式环境必须启用</small>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>成员列表</h2>
            <p>邀请与角色变更由服务端权限控制并记录审计</p>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>成员</th>
                <th>角色</th>
                <th>账号状态</th>
                <th>二次验证</th>
                <th>未完成任务</th>
                <th>负责用户</th>
                <th>有效会话</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.displayName}</strong>
                    <span className={styles.secondaryText}>
                      {member.email}
                    </span>
                  </td>
                  <td>{roleLabels[member.role]}</td>
                  <td>
                    <span
                      className={
                        member.active
                          ? styles.statusGood
                          : styles.statusDown
                      }
                    >
                      {member.active ? "启用" : "停用"}
                    </span>
                  </td>
                  <td>{member.twoFactorOn ? "已启用" : "未启用"}</td>
                  <td>{member._count.assignedTasks}</td>
                  <td>{member._count.ownedUsers}</td>
                  <td>{member._count.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
