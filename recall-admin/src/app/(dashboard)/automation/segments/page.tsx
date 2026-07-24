import styles from "@/components/workspaces/workspace.module.css";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getSegmentWorkspaceOverview } from "@/modules/admin/workspace-queries";

export default async function SegmentRulesPage(): Promise<React.JSX.Element> {
  await requireAdministrator("/automation/segments");
  const overview = await getSegmentWorkspaceOverview();
  const total = Math.max(
    1,
    overview.distribution.reduce((sum, row) => sum + row.count, 0)
  );

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>分组规则</h1>
          <p>查看当前 A–G 分组参数、用户分布和最近迁移结果。</p>
        </div>
        <span className={styles.statusGood}>
          当前版本 v{overview.version}
        </span>
      </header>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <span>A 组观察时长</span>
          <strong>2 小时</strong>
          <small>注册后未进入支付流程</small>
        </div>
        <div className={styles.statCard}>
          <span>D 组停用阈值</span>
          <strong>
            {Math.round(overview.config.inactiveMs / 86_400_000)} 天
          </strong>
          <small>有余额但持续未调用</small>
        </div>
        <div className={styles.statCard}>
          <span>E 组余额阈值</span>
          <strong>{overview.config.emptyBalanceMinor}</strong>
          <small>按最小货币单位计算</small>
        </div>
        <div className={styles.statCard}>
          <span>F 组优先级</span>
          <strong>最高</strong>
          <small>服务异常期间禁止人工覆盖</small>
        </div>
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
                    <p>{change.reason}</p>
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
