import type { DashboardSnapshot } from "@/modules/reports/dashboard-query";
import styles from "./dashboard.module.css";

const segmentNames = {
  A: "注册未支付",
  B: "支付未完成",
  C: "充值未调用",
  D: "调用后停用",
  E: "余额耗尽",
  F: "服务异常",
  G: "正常活跃"
} as const;

type SegmentDistributionProps = {
  rows: DashboardSnapshot["segmentDistribution"];
};

export function SegmentDistribution({
  rows
}: SegmentDistributionProps): React.JSX.Element {
  const max = Math.max(...rows.map((row) => row.count), 1);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section className={styles.panel} aria-labelledby="segments-heading">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="segments-heading">A–G 用户分组</h2>
          <p>当前共 {total.toLocaleString("zh-CN")} 位用户</p>
        </div>
      </header>
      <div className={styles.segmentList}>
        {rows.map((row) => (
          <div className={styles.segmentRow} key={row.segment}>
            <span
              className={`${styles.segmentCode} ${
                styles[`segment${row.segment}`]
              }`}
            >
              {row.segment}
            </span>
            <span className={styles.segmentName}>
              {segmentNames[row.segment]}
            </span>
            <span className={styles.segmentTrack}>
              <span
                className={`${styles.segmentFill} ${
                  styles[`segment${row.segment}`]
                }`}
                style={{
                  width: `${Math.max((row.count / max) * 100, row.count ? 5 : 0)}%`
                }}
              />
            </span>
            <strong>{row.count}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
