import { Check, ChevronRight } from "lucide-react";
import type { AGroupSelectedUser } from "@/modules/a-group/types";
import styles from "./a-group.module.css";

export type AGroupPanel =
  | "mail"
  | "contact"
  | "coupon"
  | "maintenance";

export function AGroupProgress({
  user,
  active,
  onSelect
}: {
  user: AGroupSelectedUser;
  active: AGroupPanel | null;
  onSelect(panel: AGroupPanel): void;
}) {
  const steps = [
    {
      key: "mail" as const,
      title: "发邮件",
      detail: `已发 ${user.mailStats.sent} · 收到 ${user.mailStats.received} · 退信 ${user.mailStats.bounced}`,
      complete: user.progress.mailComplete
    },
    {
      key: "contact" as const,
      title: "登记联系方式",
      detail: "微信 · TG · 手机号",
      complete: user.progress.contactComplete
    },
    {
      key: "coupon" as const,
      title: "送优惠券",
      detail:
        user.coupon?.status === "SUCCEEDED"
          ? "USD 1.43 · 已送"
          : "USD 1.43 · 尚未赠送",
      complete: user.progress.couponComplete
    },
    {
      key: "maintenance" as const,
      title: "日常维护",
      detail: `共 ${user.maintenanceRecords.length} 条记录`,
      complete: user.progress.maintenanceComplete
    }
  ];
  return (
    <div className={styles.progress}>
      <div className={`${styles.step} ${styles.identity}`}>
        <strong>#{user.registrationSequence}</strong>
        <small>{user.email}</small>
      </div>
      {steps.map((step) => (
        <div className={styles.stepPair} key={step.key}>
          <ChevronRight
            className={styles.arrow}
            aria-hidden="true"
            size={17}
          />
          <button
            className={`${styles.step} ${
              step.complete ? styles.complete : ""
            }`}
            data-complete={String(step.complete)}
            aria-expanded={active === step.key}
            onClick={() => onSelect(step.key)}
            type="button"
          >
            {step.complete ? (
              <Check
                className={styles.check}
                aria-hidden="true"
                size={14}
              />
            ) : null}
            <strong>{step.title}</strong>
            <small>{step.detail}</small>
          </button>
        </div>
      ))}
    </div>
  );
}
