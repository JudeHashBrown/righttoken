import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import styles from "./dashboard.module.css";

type MetricCardProps = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: "neutral" | "danger" | "warning" | "positive";
  href?: string;
};

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
  href
}: MetricCardProps): React.JSX.Element {
  const content = (
    <>
      <div className={`${styles.metricIcon} ${styles[tone]}`}>
        <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
      </div>
      <div className={styles.metricCopy}>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </>
  );
  return href ? (
    <Link
      className={`${styles.metric} ${styles.metricInteractive}`}
      href={href}
    >
      {content}
    </Link>
  ) : (
    <article className={styles.metric}>{content}</article>
  );
}
