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
            <span>当前分组方案</span>
            <strong>v{overview.version}</strong>
            <small>
              {overview.publishedBy
                ? `${overview.publishedBy} 发布`
                : "系统默认方案"}
            </small>
          </div>
          <div className={styles.statCard}>
            <span>已分组用户</span>
            <strong>{total} 人</strong>
            <small>每位用户只会进入一个分组</small>
          </div>
          <div className={styles.statCard}>
            <span>最近整理进度</span>
            <strong>{latestRun ? `${progress}%` : "尚未运行"}</strong>
            <small>
              {latestRun
                ? `${latestRun.processedUsers}/${latestRun.totalUsers} 位用户已完成`
                : "发布新方案后自动整理"}
            </small>
          </div>
          <div className={styles.statCard}>
            <span>未完成用户</span>
            <strong>{latestRun?.failedUsers ?? 0} 人</strong>
            <small>
              {latestRun?.status === "PARTIAL_FAILURE"
                ? "可在方案记录中重新处理"
                : "当前没有需要重新处理的用户"}
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
              <p>根据用户当前的注册、付费和使用情况整理</p>
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
              <h2>最近分组变化</h2>
              <p>系统调整和人工调整都会记录</p>
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
              <p>用户情况变化后，分组记录会出现在这里。</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
