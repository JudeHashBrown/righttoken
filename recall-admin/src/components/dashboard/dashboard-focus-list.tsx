import Link from "next/link";
import type { DashboardSnapshot } from "@/modules/reports/dashboard-query";
import styles from "./dashboard.module.css";

type DashboardFocusListProps = {
  focus: NonNullable<DashboardSnapshot["focus"]>;
  total: number;
  users: DashboardSnapshot["focusUsers"];
};

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(value);
}

export function DashboardFocusList({
  focus,
  total,
  users
}: DashboardFocusListProps): React.JSX.Element {
  const isUnpaid = focus === "recent-unpaid";
  const heading = isUnpaid
    ? "近72小时注册未支付用户"
    : "近72小时服务异常用户";

  return (
    <section
      id="focus-list"
      className={`${styles.panel} ${styles.focusPanel}`}
      aria-labelledby="focus-list-heading"
    >
      <header className={styles.panelHeader}>
        <div>
          <h2 id="focus-list-heading">{heading}</h2>
          <p>
            共 {total.toLocaleString("zh-CN")} 位符合条件的用户
            {total > users.length
              ? `，显示最近 ${users.length.toLocaleString("zh-CN")} 位`
              : ""}
          </p>
        </div>
      </header>

      {users.length === 0 ? (
        <p className={styles.focusEmpty}>近72小时内没有符合条件的用户</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.focusTable}>
            <thead>
              <tr>
                <th scope="col">用户</th>
                <th scope="col">邮箱</th>
                <th scope="col">{isUnpaid ? "地区" : "异常原因"}</th>
                <th scope="col">{isUnpaid ? "注册时间" : "异常时间"}</th>
                <th scope="col">负责人</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link className={styles.focusUser} href={`/users/${user.id}`}>
                      {user.displayName ?? `用户 ${user.externalUserId.slice(-6)}`}
                    </Link>
                    <span className={styles.focusUserId}>{user.externalUserId}</span>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    {isUnpaid
                      ? user.region ?? "未识别"
                      : user.anomalyReason ?? "服务异常"}
                  </td>
                  <td>
                    {formatDate(isUnpaid ? user.registeredAt : user.anomalyAt)}
                  </td>
                  <td>{user.ownerName ?? "未分配"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
