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
          <h1>分配规则</h1>
          <p>
            先按邮箱域名判断运营国家，未命中时再按注册 IP
            解析出的国家、省 / 州或地区分配负责人。
          </p>
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
          <span>待默认接管</span>
          <strong>{overview.publicPoolTasks}</strong>
          <small>历史任务或资料异常时交由主管理员</small>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>邮箱归属规则</h2>
            <p>命中邮箱规则时，优先使用邮箱对应的运营国家。</p>
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
            <h2>编辑规则顺序</h2>
            <p>先预览最近用户，再一次性发布整个规则集</p>
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
