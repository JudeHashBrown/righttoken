import type { LucideIcon } from "lucide-react";
import styles from "./dashboard.module.css";

type MetricCardProps = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: "neutral" | "danger" | "warning" | "positive";
};

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone
}: MetricCardProps): React.JSX.Element {
  return (
    <article className={styles.metric}>
      <div className={`${styles.metricIcon} ${styles[tone]}`}>
        <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
      </div>
      <div className={styles.metricCopy}>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}
