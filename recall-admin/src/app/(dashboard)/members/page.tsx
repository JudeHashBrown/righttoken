import styles from "@/components/workspaces/workspace.module.css";
import { MemberInviteForm } from "@/components/members/member-invite-form";
import { MemberAccessActions } from "@/components/members/member-access-actions";
import { MemberWecomMappingForm } from "@/components/members/member-wecom-mapping-form";
import { MemberTerritoryEditor } from "@/components/members/member-territory-editor";
import { requireAdministrator } from "@/modules/admin/page-access";
import {
  getAssignmentWorkspaceOverview,
  getMemberWorkspaceOverview
} from "@/modules/admin/workspace-queries";
import { territoriesForMember } from "@/modules/assignment/member-territories";
import type { AssignmentRuleInput } from "@/modules/assignment/types";

const roleLabels = {
  PRIMARY_ADMIN: "主管理员",
  ADMIN: "管理员",
  OPERATOR: "运营人员"
} as const;

export default async function MembersPage(): Promise<React.JSX.Element> {
  const viewer = await requireAdministrator("/members");
  const [members, assignment] = await Promise.all([
    getMemberWorkspaceOverview(),
    getAssignmentWorkspaceOverview()
  ]);
  const assignmentRules: AssignmentRuleInput[] =
    assignment.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      memberTerritoryManaged: rule.memberTerritoryManaged,
      priority: rule.priority,
      conditions:
        rule.conditions as AssignmentRuleInput["conditions"],
      assigneeId: rule.assigneeId,
      fallbackAssigneeId: rule.fallbackAssigneeId,
      poolKey: rule.poolKey,
      workloadLimit: rule.workloadLimit,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo
    }));

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>成员与权限</h1>
          <p>授权主站用户进入用户运营后台，并管理管理员和运营人员权限。</p>
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
      </div>

      <MemberInviteForm viewerRole={viewer.role} />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>成员列表</h2>
            <p>撤销权限不会删除主站账号或历史记录</p>
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>成员</th>
                <th>角色</th>
                <th>账号状态</th>
                <th>未完成任务</th>
                <th>负责用户</th>
                <th>负责地区</th>
                <th>企微通知</th>
                <th>权限操作</th>
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
                  <td>{member._count.assignedTasks}</td>
                  <td>{member._count.ownedUsers}</td>
                  <td>
                    {member.role === "OPERATOR" && member.active ? (
                      <MemberTerritoryEditor
                        member={{
                          id: member.id,
                          displayName: member.displayName
                        }}
                        initialTerritories={territoriesForMember(
                          member.id,
                          assignmentRules
                        )}
                        allRules={assignmentRules}
                      />
                    ) : (
                      <span className={styles.secondaryText}>
                        全局管理
                      </span>
                    )}
                  </td>
                  <td>
                    <MemberWecomMappingForm
                      memberId={member.id}
                      initialWecomUserId={member.wecomUserId}
                      active={member.active}
                    />
                  </td>
                  <td>
                    <MemberAccessActions
                      memberId={member.id}
                      memberRole={member.role}
                      memberName={member.displayName}
                      active={member.active}
                      viewerId={viewer.id}
                      viewerRole={viewer.role}
                      successorOptions={members
                        .filter(
                          (candidate) =>
                            candidate.active &&
                            candidate.id !== member.id
                        )
                        .map((candidate) => ({
                          id: candidate.id,
                          displayName: candidate.displayName,
                          email: candidate.email,
                          role: candidate.role
                        }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
