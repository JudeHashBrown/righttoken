import { Check, ChevronRight } from "lucide-react";
import type { EGroupSelectedUser } from "@/modules/e-group/types";
import styles from "@/components/a-group/a-group.module.css";

export type EGroupPanel = "contact" | "outreach" | "carePlan" | "maintenance";

export function EGroupProgress({ user, active, onSelect }: {
  user: EGroupSelectedUser;
  active: EGroupPanel | null;
  onSelect(panel: EGroupPanel): void;
}) {
  const steps = [
    { key: "contact" as const, title: "登记联系方式", detail: "微信 · TG", complete: Boolean(user.contact?.wechatId || user.contact?.telegramHandle) },
    { key: "outreach" as const, title: "催促复充", detail: `邮件 ${user.outreach.mail.length} · 微信 ${user.outreach.wechat.length}`, complete: user.outreach.mail.length + user.outreach.wechat.length > 0 },
    { key: "carePlan" as const, title: "个性化维护方案", detail: user.latestCarePlan ? "已记录最新方案" : "等待运营填写", complete: Boolean(user.latestCarePlan) },
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
          <button
            className={`${styles.step} ${step.complete ? styles.complete : ""}`}
            data-complete={String(step.complete)}
            aria-expanded={active === step.key}
            onClick={() => onSelect(step.key)}
            type="button"
          >
            {step.complete ? <Check className={styles.check} aria-hidden="true" size={14} /> : null}
            <strong>{step.title}</strong>
            <small>{step.detail}</small>
          </button>
        </div>
      ))}
    </div>
  );
}
