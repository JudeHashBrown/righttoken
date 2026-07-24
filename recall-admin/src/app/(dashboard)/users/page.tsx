import Link from "next/link";
import { redirect } from "next/navigation";
import type { SegmentCode } from "@/generated/prisma/client";
import { UserTable } from "@/components/tables/user-table";
import styles from "@/components/workspaces/workspace.module.css";
import { prisma } from "@/lib/db/prisma";
import { getCurrentMember } from "@/modules/auth/guards";
import { findUsers } from "@/modules/users/user-queries";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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
  const member = await getCurrentMember();
  if (!member) redirect("/login?next=/users");
  const params = await searchParams;
  const segment = first(params.segment);
  const registeredFrom = first(params.registeredFrom);
  const registeredTo = first(params.registeredTo);
  const page = await findUsers(member, {
    search: first(params.search),
    segments: /^[A-G]$/.test(segment)
      ? [segment as SegmentCode]
      : undefined,
    countryCode: first(params.countryCode) || undefined,
    region: first(params.region) || undefined,
    ownerId: first(params.ownerId) || undefined,
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

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>用户中心</h1>
          <p>
            查看用户当前分组、完整邮箱、业务事实、负责人和下一项运营任务。
            完整注册 IP 仅在用户详情页展示。
          </p>
        </div>
      </header>

      <form className={styles.filterBar}>
        <div className={`${styles.field} ${styles.fieldGrow}`}>
          <label htmlFor="user-search">搜索用户</label>
          <input
            className={styles.input}
            defaultValue={first(params.search)}
            id="user-search"
            name="search"
            placeholder="用户编号、邮箱、姓名、国家或地区"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="user-segment">分组</label>
          <select
            className={styles.select}
            defaultValue={segment}
            id="user-segment"
            name="segment"
          >
            <option value="">全部分组</option>
            {(["A", "B", "C", "D", "E", "F", "G"] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              )
            )}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="user-country">国家</label>
          <input
            className={styles.input}
            defaultValue={first(params.countryCode)}
            id="user-country"
            name="countryCode"
            placeholder="例如 US"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="user-region">地区</label>
          <input
            className={styles.input}
            defaultValue={first(params.region)}
            id="user-region"
            name="region"
            placeholder="例如 广东"
          />
        </div>
        {owners.length ? (
          <div className={styles.field}>
            <label htmlFor="user-owner">负责人</label>
            <select
              className={styles.select}
              defaultValue={first(params.ownerId)}
              id="user-owner"
              name="ownerId"
            >
              <option value="">全部负责人</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.displayName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
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
            <p>本页 {page.items.length} 位用户</p>
          </div>
        </div>
        <UserTable users={page.items} />
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
