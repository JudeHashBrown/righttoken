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

function formatUsdMinor(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD"
  }).format(value / 100);
}

export function DashboardFocusList({
  focus,
  total,
  users
}: DashboardFocusListProps): React.JSX.Element {
  const isUnpaid = focus === "recent-unpaid";
  const isLowBalance = focus === "recent-low-balance";
  const heading = isUnpaid
    ? "近72小时注册未支付用户"
    : isLowBalance
      ? "近72小时余额快耗尽用户"
      : "近72小时服务异常用户";
  const detailHeading = isUnpaid
    ? "地区"
    : isLowBalance
      ? "当前余额"
      : "异常原因";
  const timeHeading = isUnpaid
    ? "注册时间"
    : isLowBalance
      ? "最近使用时间"
      : "异常时间";

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
                <th scope="col">{detailHeading}</th>
                <th scope="col">{timeHeading}</th>
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
                      : isLowBalance
                        ? formatUsdMinor(user.balanceUsdMinor)
                      : user.anomalyReason ?? "服务异常"}
                  </td>
                  <td>
                    {formatDate(
                      isUnpaid
                        ? user.registeredAt
                        : isLowBalance
                          ? user.lastCallAt
                          : user.anomalyAt
                    )}
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
