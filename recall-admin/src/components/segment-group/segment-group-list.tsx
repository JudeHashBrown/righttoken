import Link from "next/link";
import styles from "@/components/a-group/a-group.module.css";
import groupStyles from "./segment-group-list.module.css";

type User = {
  id: string;
  externalUserId: string;
  displayName: string | null;
  email: string;
  countryCode: string | null;
  lastCallAt: Date | null;
  firstPaidAt: Date | null;
  totalPaidMinor: number;
  balanceCurrency: string;
};

export function SegmentGroupList({ code, title, description, users }: {
  code: "C" | "D";
  title: string;
  description: string;
  users: User[];
}) {
  return (
    <main className={styles.page}>
      <header><h1>{title}</h1><p className={styles.reasons}><span>{description}</span><span>按最近状态更新时间排序</span></p></header>
      <section className={groupStyles.listPanel}>
        <div className={groupStyles.listHead}><strong>{code}组用户</strong><span>{users.length}</span></div>
        {users.length ? users.map((user) => (
          <Link className={groupStyles.userRow} href={`/users/${user.id}`} key={user.id}>
            <span><strong>{user.displayName || `#${user.externalUserId}`}</strong><small>{user.email}</small></span>
            <span><strong>{user.balanceCurrency} {(user.totalPaidMinor / 100).toFixed(2)}</strong><small>{user.countryCode || "未知地区"}</small></span>
          </Link>
        )) : <div className={styles.empty}>暂无{title}用户</div>}
      </section>
    </main>
  );
}
