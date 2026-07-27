"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import styles from "./app-header.module.css";

type AppHeaderProps = {
  memberName: string;
  urgentCount: number;
};

export function AppHeader({
  memberName,
  urgentCount
}: AppHeaderProps): React.JSX.Element {
  const pathname = usePathname();
  const workspaceLabel =
    [
      ["/automation/notifications", "通知策略"],
      ["/automation/assignment", "分配规则"],
      ["/automation/segments", "用户分组"],
      ["/dashboard", "运营驾驶舱"],
      ["/tasks", "任务中心"],
      ["/users", "用户中心"],
      ["/mail", "邮件中心"],
      ["/reports", "数据报表"],
      ["/members", "成员与权限"],
      ["/settings", "系统设置"]
    ].find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
    "运营驾驶舱";

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
        <Link
          className={styles.notification}
          href="/tasks?priority=URGENT"
          aria-label={`紧急任务 ${urgentCount} 条`}
        >
          <Bell aria-hidden="true" size={18} />
          {urgentCount > 0 ? (
            <span>{urgentCount}</span>
          ) : null}
        </Link>
        <span className={styles.memberName}>{memberName}</span>
      </div>
    </header>
  );
}
