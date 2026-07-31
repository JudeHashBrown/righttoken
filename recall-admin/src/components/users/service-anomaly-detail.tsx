import styles from "@/components/workspaces/workspace.module.css";
import type { ServiceAnomalyPresentation } from "@/modules/anomalies/presentation";

export function ServiceAnomalyDetail({
  anomaly
}: {
  anomaly: ServiceAnomalyPresentation;
}): React.JSX.Element {
  return (
    <div className={styles.anomalyDetail}>
      <div>
        <span className={styles.detailLabel}>当前异常</span>
        <strong>{anomaly.title}</strong>
        <p>{anomaly.summary}</p>
      </div>
      {anomaly.metadata.length > 0 ? (
        <div className={styles.anomalyMetadata}>
          {anomaly.metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
