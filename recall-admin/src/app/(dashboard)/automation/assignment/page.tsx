import styles from "@/components/workspaces/workspace.module.css";
import {
  AssignmentRuleEditor,
  type EditableAssignmentRule
} from "@/components/automation/assignment-rule-editor";
import {
  LocationRuleEditor,
  type EditableLocationRule
} from "@/components/automation/location-rule-editor";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getAssignmentWorkspaceOverview } from "@/modules/admin/workspace-queries";

function stringList(
  conditions: unknown,
  key: "countryCodes" | "regionIncludes" | "sources"
): string {
  if (!conditions || typeof conditions !== "object") return "";
  const value = (conditions as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.join(", ") : "";
}

function segmentList(conditions: unknown) {
  if (!conditions || typeof conditions !== "object") return [];
  const value = (conditions as Record<string, unknown>).segments;
  return Array.isArray(value)
    ? value.filter(
        (item): item is "A" | "B" | "C" | "D" | "E" | "F" | "G" =>
          typeof item === "string" &&
          ["A", "B", "C", "D", "E", "F", "G"].includes(item)
      )
    : [];
}

export default async function AssignmentRulesPage(): Promise<React.JSX.Element> {
  const member = await requireAdministrator("/automation/assignment");
  const overview = await getAssignmentWorkspaceOverview();
  const editableRules: EditableAssignmentRule[] = overview.rules.map(
    (rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      memberTerritoryManaged: rule.memberTerritoryManaged,
      priority: rule.priority,
      countryCodes: stringList(rule.conditions, "countryCodes"),
      regions: stringList(rule.conditions, "regionIncludes"),
      sources: stringList(rule.conditions, "sources"),
      segments: segmentList(rule.conditions),
      assigneeId: rule.assigneeId ?? "",
      fallbackAssigneeId: rule.fallbackAssigneeId ?? "",
      poolKey: rule.poolKey ?? "",
      workloadLimit: rule.workloadLimit?.toString() ?? ""
    })
  );
  const locationRules: EditableLocationRule[] =
    overview.locationRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      matchType: rule.matchType,
      pattern: rule.pattern,
      countryCode: rule.countryCode
    }));

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>客户分配</h1>
          <p>
            先按邮箱域名判断运营国家，未命中时再按注册 IP
            解析出的国家、省 / 州或地区分配负责人。
          </p>
        </div>
      </header>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <span>分配条件</span>
          <strong>{overview.rules.length}</strong>
          <small>按页面顺序依次判断</small>
        </div>
        <div className={styles.statCard}>
          <span>正在使用</span>
          <strong>
            {overview.rules.filter((rule) => rule.enabled).length}
          </strong>
          <small>停用的条件不会分配用户</small>
        </div>
        <div className={styles.statCard}>
          <span>可用成员</span>
          <strong>{overview.members.length}</strong>
          <small>包含管理员和运营人员</small>
        </div>
        <div className={styles.statCard}>
          <span>待分配任务</span>
          <strong>{overview.publicPoolTasks}</strong>
          <small>尚未匹配运营人员的任务</small>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>邮箱来源判断</h2>
            <p>可以根据邮箱域名优先判断用户所属国家或地区。</p>
          </div>
        </div>
        <LocationRuleEditor
          editable={member.role === "PRIMARY_ADMIN"}
          initialRules={locationRules}
        />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>负责人分配顺序</h2>
            <p>先查看预计分配结果，确认后保存整套方案</p>
          </div>
        </div>
        <AssignmentRuleEditor
          initialRules={editableRules}
          members={overview.members.map((member) => ({
            id: member.id,
            displayName: member.displayName,
            role: member.role,
            openTasks: member._count.assignedTasks
          }))}
        />
      </section>
    </main>
  );
}
