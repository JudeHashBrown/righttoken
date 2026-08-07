import Link from "next/link";
import type { UserListItem } from "@/modules/users/user-queries";
import styles from "@/components/workspaces/workspace.module.css";
import { UserAssignmentControl } from "@/components/users/user-assignment-control";
import { UserOwnerControl } from "@/components/users/user-owner-control";
import {
  TableHeaderFilter
} from "@/components/tables/table-header-filter";
import { presentServiceAnomaly } from "@/modules/anomalies/presentation";
import {
  locationAssignmentLabel,
  operationalLocationDisplay,
  ownerAssignmentLabel,
  ownerDisplayName,
  paymentStatusLabel
} from "@/modules/users/presentation";

type UserTableProps = {
  users: UserListItem[];
  canManageOwners?: boolean;
  members?: Array<{
    id: string;
    displayName: string;
  }>;
  headerFilters?: {
    formId?: string;
    region: string;
    regions: string[];
    ownerId: string;
    owners: Array<{
      id: string;
      displayName: string;
    }>;
  };
};

function dateTime(value: Date | null): string {
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

function money(minor: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(minor / 100);
}

export function UserTable({
  users,
  canManageOwners = false,
  members = [],
  headerFilters
}: UserTableProps): React.JSX.Element {
  if (users.length === 0) {
    return (
      <div className={styles.empty}>
        <strong>没有符合条件的用户</strong>
        <p>调整筛选条件，或等待新的注册与业务事件进入系统。</p>
      </div>
    );
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>分组</th>
            <th>用户</th>
            <th>
              {headerFilters ? (
                <TableHeaderFilter
                  formId={headerFilters.formId}
                  label="地区"
                  name="region"
                  options={[
                    { value: "", label: "全部地区" },
                    {
                      value: "__UNRECOGNIZED__",
                      label: "未识别"
                    },
                    ...headerFilters.regions.map((region) => ({
                      value: region,
                      label: region
                    }))
                  ]}
                  value={headerFilters.region}
                />
              ) : (
                "地区"
              )}
            </th>
            <th>支付与余额</th>
            <th>调用情况</th>
            <th>
              {headerFilters?.owners.length ? (
                <TableHeaderFilter
                  formId={headerFilters.formId}
                  label="负责人"
                  name="ownerId"
                  options={[
                    { value: "", label: "全部负责人" },
                    {
                      value: "__UNASSIGNED__",
                      label: "未分配"
                    },
                    ...headerFilters.owners.map((owner) => ({
                      value: owner.id,
                      label: owner.displayName
                    }))
                  ]}
                  value={headerFilters.ownerId}
                />
              ) : (
                "负责人"
              )}
            </th>
            <th>下一任务</th>
            <th>最后事件</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const nextTask = user.tasks[0];
            const location = operationalLocationDisplay(user);
            const anomaly = presentServiceAnomaly(user);
            return (
              <tr key={user.id}>
                <td>
                  <span className={styles.segment}>
                    {user.currentSegment}
                  </span>
                  {anomaly ? (
                    <span className={styles.anomalyCompact}>
                      <strong>{anomaly.title}</strong>
                      <span>{anomaly.summary}</span>
                    </span>
                  ) : null}
                </td>
                <td>
                  <Link
                    className={styles.primaryLink}
                    href={`/users/${user.id}`}
                  >
                    {user.externalUserId}
                  </Link>
                  {user.displayName ? (
                    <span className={styles.secondaryText}>
                      {user.displayName}
                    </span>
                  ) : null}
                  <span className={styles.secondaryText}>
                    {user.email}
                  </span>
                </td>
                <td>
                  {location.primary}
                  <span className={styles.secondaryText}>
                    {location.secondary}
                  </span>
                  {user.locationAssignmentMode === "MANUAL" ? (
                    <span className={styles.secondaryText}>
                      {locationAssignmentLabel(
                        user.locationAssignmentMode
                      )}
                    </span>
                  ) : null}
                </td>
                <td>
                  {paymentStatusLabel(
                    user.paymentStatus,
                    user.totalPaidMinor
                  )}
                  <span className={styles.secondaryText}>
                    累计 {money(user.totalPaidMinor)} · 余额{" "}
                    {money(user.balanceMinor)}
                  </span>
                </td>
                <td>
                  {user.successfulCallCount} 次成功
                  <span className={styles.secondaryText}>
                    最近 {dateTime(user.lastCallAt)}
                  </span>
                </td>
                <td>
                  <strong>{ownerDisplayName(user.owner)}</strong>
                  <span className={styles.secondaryText}>
                    {user.ownerId
                      ? ownerAssignmentLabel(
                          user.ownerAssignmentMode
                        )
                      : "等待管理员分配"}
                  </span>
                  {canManageOwners && user.ownerId ? (
                    <UserOwnerControl
                      compact
                      userId={user.id}
                      currentOwnerId={user.ownerId}
                      currentOwnerName={ownerDisplayName(user.owner)}
                      assignmentMode={user.ownerAssignmentMode}
                      members={members}
                    />
                  ) : canManageOwners ? (
                    <UserAssignmentControl
                      userId={user.id}
                      currentCountryCode={user.countryCode}
                      currentRegion={user.region}
                      members={members}
                    />
                  ) : null}
                </td>
                <td>
                  {nextTask ? (
                    <strong>{nextTask.title}</strong>
                  ) : (
                    "—"
                  )}
                  {nextTask ? (
                    <span className={styles.secondaryText}>
                      {dateTime(nextTask.dueAt)}
                    </span>
                  ) : null}
                </td>
                <td>{dateTime(user.lastExternalEventAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
