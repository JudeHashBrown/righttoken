"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, Menu } from "lucide-react";
import styles from "./app-header.module.css";

type AppHeaderProps = {
  memberName: string;
  mainSiteUrl: string;
};

export function AppHeader({
  memberName,
  mainSiteUrl
}: AppHeaderProps): React.JSX.Element {
  const pathname = usePathname();
  const workspaceLabel =
    [
      ["/automation/notifications", "提醒设置"],
      ["/automation/assignment", "客户分配"],
      ["/automation/segments", "用户分组"],
      ["/groups/b", "B-未完成支付"],
      ["/groups/a", "A-仅注册"],
      ["/groups/e", "E-余额不足"],
      ["/groups/c", "C-充值未调用"],
      ["/groups/d", "D-长期未调用"],
      ["/dashboard", "用户运营概览"],
      ["/users", "用户中心"],
      ["/mail", "邮件中心"],
      ["/reports", "数据报表"],
      ["/members", "成员与权限"],
      ["/settings", "系统设置"]
    ].find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
    "用户运营概览";

  return (
    <header className={styles.header}>
      <div className={styles.mobileBrand}>
        <Menu aria-hidden="true" size={19} />
        <strong>RightToken</strong>
      </div>

      <p className={styles.context}>
        用户运营中心
        <span aria-hidden="true">/</span>
        <strong>{workspaceLabel}</strong>
      </p>

      <div className={styles.actions}>
        <a
          className={styles.mainSiteLink}
          href={mainSiteUrl}
          aria-label="返回主站"
          title="返回主站"
        >
          <ArrowLeft
            aria-hidden="true"
            size={17}
            strokeWidth={1.9}
          />
          <span className={styles.mainSiteLabel}>返回主站</span>
        </a>
        <span className={styles.memberName}>{memberName}</span>
      </div>
    </header>
  );
}
