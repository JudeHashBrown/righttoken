import Link from "next/link";
import type { SegmentCode } from "@/generated/prisma/client";
import { UserTable } from "@/components/tables/user-table";
import { SegmentQuickFilter } from "@/components/users/segment-quick-filter";
import styles from "@/components/workspaces/workspace.module.css";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { findUsers } from "@/modules/users/user-queries";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const unrecognizedLocationValue = "__UNRECOGNIZED__";
const unassignedOwnerValue = "__UNASSIGNED__";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function preservedParams(
  params: Record<string, string | string[] | undefined>,
  excluded: string[]
): Array<[string, string]> {
  return Object.entries(params).flatMap(([key, value]) => {
    const item = first(value);
    return item && !excluded.includes(key) ? [[key, item]] : [];
  });
}

function nextHref(
  params: Record<string, string | string[] | undefined>,
  cursor: string
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const item = first(value);
    if (item && key !== "cursor") query.set(key, item);
  }
  query.set("cursor", cursor);
  return `/users?${query.toString()}`;
}

export default async function UsersPage({
  searchParams
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/users");
  const params = await searchParams;
  const segment = first(params.segment);
  const search = first(params.search).trim();
  const searchTooShort = search.length > 0 && search.length < 3;
  const registeredFrom = first(params.registeredFrom);
  const registeredTo = first(params.registeredTo);
  const regionFilter = first(params.region);
  const ownerFilter = first(params.ownerId);
  const page = searchTooShort
    ? { items: [], nextCursor: null }
    : await findUsers(member, {
        search,
        segments: /^[A-G]$/.test(segment)
          ? [segment as SegmentCode]
          : undefined,
        countryCode: first(params.countryCode) || undefined,
        region:
          regionFilter &&
          regionFilter !== unrecognizedLocationValue
            ? regionFilter
            : undefined,
        locationState:
          regionFilter === unrecognizedLocationValue
            ? "unrecognized"
            : undefined,
        ownerId:
          ownerFilter && ownerFilter !== unassignedOwnerValue
            ? ownerFilter
            : undefined,
        ownerState:
          ownerFilter === unassignedOwnerValue
            ? "unassigned"
            : undefined,
        source: first(params.source) || undefined,
        registeredFrom: registeredFrom
          ? new Date(`${registeredFrom}T00:00:00.000Z`)
          : undefined,
        registeredTo: registeredTo
          ? new Date(`${registeredTo}T23:59:59.999Z`)
          : undefined,
        cursor: first(params.cursor) || undefined,
        pageSize: 30
      });
  const owners =
    member.role === "OPERATOR"
      ? []
      : await prisma.member.findMany({
          where: { active: true },
          orderBy: { displayName: "asc" },
          select: { id: true, displayName: true }
        });
  const regionRows = await prisma.userProfile.findMany({
    where: {
      sourceDeletedAt: null,
      region: { not: null },
      ...(member.role === "OPERATOR"
        ? { ownerId: member.id }
        : {})
    },
    distinct: ["region"],
    orderBy: { region: "asc" },
    select: { region: true }
  });
  const regions = regionRows
    .map((row) => row.region?.trim())
    .filter((region): region is string => Boolean(region));

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>用户中心</h1>
          <p>
            查看用户当前分组、完整邮箱、付费与使用情况、负责人和下一项运营任务。
            完整注册 IP 仅在用户详情页展示。
          </p>
        </div>
      </header>

      <form className={`${styles.filterBar} ${styles.userFilterBar}`}>
        {regionFilter ? (
          <input name="region" type="hidden" value={regionFilter} />
        ) : null}
        {ownerFilter ? (
          <input
            name="ownerId"
            type="hidden"
            value={ownerFilter}
          />
        ) : null}
        <div className={`${styles.field} ${styles.fieldGrow}`}>
          <label htmlFor="user-search">搜索用户</label>
          <input
            className={styles.input}
            defaultValue={first(params.search)}
            id="user-search"
            minLength={3}
            name="search"
            placeholder="用户编号、邮箱或姓名（至少 3 个字符）"
          />
        </div>
        <SegmentQuickFilter selectedSegment={segment} />
        <div className={`${styles.field} ${styles.userFilterCompact}`}>
          <label htmlFor="user-country">国家</label>
          <input
            className={styles.input}
            defaultValue={first(params.countryCode)}
            id="user-country"
            name="countryCode"
            placeholder="例如 中国或 CN"
          />
        </div>
        <button className={styles.button} type="submit">
          应用筛选
        </button>
        <Link className={styles.secondaryButton} href="/users">
          清除
        </Link>
      </form>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>用户列表</h2>
            <p>
              {searchTooShort
                ? "请输入至少 3 个字符进行搜索"
                : `本页 ${page.items.length} 位用户`}
            </p>
          </div>
        </div>
        <form action="/users" id="user-table-filters">
          {preservedParams(params, [
            "cursor",
            "region",
            "ownerId"
          ]).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
        </form>
        <UserTable
          users={page.items}
          canManageOwners={member.role !== "OPERATOR"}
          headerFilters={{
            formId: "user-table-filters",
            region: regionFilter,
            regions,
            ownerId: ownerFilter,
            owners
          }}
          members={owners}
        />
      </section>

      {page.nextCursor ? (
        <nav className={styles.pagination} aria-label="用户分页">
          <Link
            className={styles.secondaryButton}
            href={nextHref(params, page.nextCursor)}
          >
            下一页
          </Link>
        </nav>
      ) : null}
    </main>
  );
}
