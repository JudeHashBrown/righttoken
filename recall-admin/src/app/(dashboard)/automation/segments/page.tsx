import styles from "@/components/workspaces/workspace.module.css";
import { SegmentRuleEditor } from "@/components/automation/segment-rule-editor";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getSegmentWorkspaceOverview } from "@/modules/admin/workspace-queries";
import { getPublicSegmentFieldRegistry } from "@/modules/segmentation/field-registry";
import { presentSegmentReason } from "@/modules/segmentation/present-reason";

export default async function SegmentRulesPage(): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/automation/segments");
  const overview = await getSegmentWorkspaceOverview();
  const total = overview.distribution.reduce(
    (sum, row) => sum + row.count,
    0
  );
  const latestRun = overview.latestRun;
  const progress = latestRun?.totalUsers
    ? Math.round(
        (latestRun.processedUsers / latestRun.totalUsers) * 100
      )
    : latestRun?.status === "COMPLETED"
      ? 100
      : 0;
  const distribution = Object.fromEntries(
    overview.distribution.map((row) => [row.segment, row.count])
  ) as Record<"A" | "B" | "C" | "D" | "E" | "F" | "G", number>;

  return (
    <main className={styles.page}>
      <div className={styles.segmentWorkspace}>
        <div className={`${styles.cardGrid} ${styles.compactCardGrid}`}>
          <div className={styles.statCard}>
            <span>当前生效版本</span>
            <strong>v{overview.version}</strong>
            <small>
              {overview.publishedBy
                ? `${overview.publishedBy} 发布`
                : "系统默认规则"}
            </small>
          </div>
          <div className={styles.statCard}>
            <span>规则覆盖用户</span>
            <strong>{total} 人</strong>
            <small>系统内全部用户均归入唯一分组</small>
          </div>
          <div className={styles.statCard}>
            <span>最近全量重算</span>
            <strong>{latestRun ? `${progress}%` : "尚未运行"}</strong>
            <small>
              {latestRun
                ? `${latestRun.processedUsers}/${latestRun.totalUsers} 已处理`
                : "发布新规则后自动执行"}
            </small>
          </div>
          <div className={styles.statCard}>
            <span>重算失败</span>
            <strong>{latestRun?.failedUsers ?? 0} 人</strong>
            <small>
              {latestRun?.status === "PARTIAL_FAILURE"
                ? "可在历史版本中重试"
                : "当前没有待重试失败"}
            </small>
          </div>
        </div>

        <SegmentRuleEditor
          canEdit={member.role !== "OPERATOR"}
          distribution={distribution}
          fieldRegistry={getPublicSegmentFieldRegistry()}
          initialRuleSet={overview.ruleSet}
          topLayout
        />
      </div>

      <div className={styles.twoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>当前用户分布</h2>
              <p>基于数据库中的最新用户事实</p>
            </div>
          </div>
          <div className={styles.distribution}>
            {overview.distribution.map((row) => (
              <div className={styles.distributionRow} key={row.segment}>
                <strong>{row.segment}</strong>
                <span className={styles.barTrack}>
                  <span
                    className={styles.barFill}
                    style={{ width: `${(row.count / total) * 100}%` }}
                  />
                </span>
                <span>{row.count} 人</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>最近分组迁移</h2>
              <p>自动规则和人工操作统一记录</p>
            </div>
          </div>
          {overview.recentChanges.length ? (
            <ul className={styles.list}>
              {overview.recentChanges.map((change) => (
                <li className={styles.listItem} key={change.id}>
                  <div>
                    <strong>
                      {change.user.displayName ||
                        change.user.externalUserId}
                    </strong>
                    <p>{presentSegmentReason(change.reason)}</p>
                  </div>
                  <span className={styles.segment}>
                    {change.fromSegment || "新"} → {change.toSegment}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <strong>暂无迁移记录</strong>
              <p>用户事实变化后，分组历史会出现在这里。</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
