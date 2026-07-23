import Link from "next/link";
import { Bell, LogOut, Menu } from "lucide-react";
import styles from "./app-header.module.css";

type AppHeaderProps = {
  memberName: string;
  urgentCount: number;
};

export function AppHeader({
  memberName,
  urgentCount
}: AppHeaderProps): React.JSX.Element {
  return (
    <header className={styles.header}>
      <div className={styles.mobileBrand}>
        <Menu aria-hidden="true" size={19} />
        <strong>RightToken</strong>
      </div>

      <p className={styles.context}>
        用户运营中心
        <span aria-hidden="true">/</span>
        <strong>运营驾驶舱</strong>
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
        <form action="/api/auth/logout" method="post">
          <button className={styles.logout} type="submit">
            <LogOut aria-hidden="true" size={16} />
            <span>退出</span>
          </button>
        </form>
      </div>
    </header>
  );
}
