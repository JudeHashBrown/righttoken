import { Check, ChevronRight } from "lucide-react";
import type { DGroupSelectedUser } from "@/modules/d-group/types";
import styles from "@/components/a-group/a-group.module.css";

export type DGroupPanel = "inquiry" | "contact" | "guidance" | "maintenance";

export function DGroupProgress({ user, active, onSelect }: {
  user: DGroupSelectedUser;
  active: DGroupPanel | null;
  onSelect(panel: DGroupPanel): void;
}) {
  const steps = [
    { key: "inquiry" as const, title: "邮件询问", detail: `邮件 ${user.inquiryMail.length} · 原因 ${user.reasons.length}`, complete: user.inquiryMail.length + user.reasons.length > 0 },
    { key: "contact" as const, title: "登记联系方式", detail: "微信 · TG", complete: Boolean(user.contact?.wechatId || user.contact?.telegramHandle) },
    { key: "guidance" as const, title: "详细辅导", detail: `共 ${user.guidanceRecords.length} 条记录`, complete: user.guidanceRecords.length > 0 },
    { key: "maintenance" as const, title: "日常维护", detail: `共 ${user.maintenanceRecords.length} 条记录`, complete: user.maintenanceRecords.some((record) => record.effective) }
  ];
  return (
    <div className={styles.progress}>
      <div className={`${styles.step} ${styles.identity}`}>
        <strong>{user.displayName || `#${user.registrationSequence}`}</strong>
        <small>{user.email}</small>
      </div>
      {steps.map((step) => (
        <div className={styles.stepPair} key={step.key}>
          <ChevronRight className={styles.arrow} aria-hidden="true" size={17} />
          <button className={`${styles.step} ${step.complete ? styles.complete : ""}`} data-complete={String(step.complete)} aria-expanded={active === step.key} onClick={() => onSelect(step.key)} type="button">
            {step.complete ? <Check className={styles.check} aria-hidden="true" size={14} /> : null}
            <strong>{step.title}</strong><small>{step.detail}</small>
          </button>
        </div>
      ))}
    </div>
  );
}
