import styles from "@/components/workspaces/workspace.module.css";
import type {
  ServiceAnomalyPresentation
} from "@/modules/anomalies/presentation";

export function TaskAnomalyHighlight({
  anomaly
}: {
  anomaly: ServiceAnomalyPresentation;
}): React.JSX.Element {
  return (
    <section
      className={styles.taskAnomalyHighlight}
      aria-label="服务异常具体原因"
      role="status"
    >
      <span className={styles.taskAnomalyLabel}>具体错误</span>
      <strong>{anomaly.diagnosis}</strong>
      {anomaly.rawError ? (
        <p className={styles.taskAnomalyRaw}>
          <span>原始错误：</span>
          <code>{anomaly.rawError}</code>
        </p>
      ) : null}
      <p className={styles.taskAnomalySummary}>
        <span>{anomaly.title}</span>
        <span>{anomaly.summary}</span>
      </p>
      {anomaly.metadata.length > 0 ? (
        <div className={styles.taskAnomalyMetadata}>
          {anomaly.metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
