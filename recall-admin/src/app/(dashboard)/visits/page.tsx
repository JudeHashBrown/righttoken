import Link from "next/link";
import type { CSSProperties } from "react";
import workspace from "@/components/workspaces/workspace.module.css";
import { requireAdministrator } from "@/modules/admin/page-access";
import { getGeoIpRuntimeStatus } from "@/modules/geoip/runtime-status";
import { getUserCountrySummary } from "@/modules/users/country-summary";
import {
  getVisitDashboard,
  type VisitRangeDays
} from "@/modules/visits/queries";
import styles from "./visit-dashboard.module.css";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const rangeOptions: Array<{
  days: VisitRangeDays;
  label: string;
}> = [
  { days: 7, label: "7 天" },
  { days: 30, label: "30 天" },
  { days: 90, label: "90 天" }
];

const numberFormatter = new Intl.NumberFormat("zh-CN");

function parseRange(
  value: string | string[] | undefined
): VisitRangeDays {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = Number(first);
  return parsed === 7 || parsed === 90 ? parsed : 30;
}

function percentage(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function shortDate(value: string): string {
  return value.slice(5).replace("-", "/");
}

export default async function VisitsPage({
  searchParams
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  await requireAdministrator("/visits");
  const rangeDays = parseRange((await searchParams).days);
  const [dashboard, userSummary, geoIpStatus] = await Promise.all([
    getVisitDashboard(rangeDays),
    getUserCountrySummary(),
    getGeoIpRuntimeStatus()
  ]);
  const maxDaily = Math.max(
    1,
    ...dashboard.daily.flatMap((row) => [row.uv, row.pv])
  );
  const chinaPv = dashboard.chinaRegions.reduce(
    (sum, row) => sum + row.pv,
    0
  );
  const hasUnknown = dashboard.countries.some(
    (row) => row.countryCode === "ZZ"
  );
  const unknownCopy =
    geoIpStatus.kind === "unavailable"
      ? "GeoIP 数据源不可用，当前未知访问无法解析；请检查部署配置和数据文件。"
      : "GeoIP 数据源已启用；剩余未知访问通常来自内网、保留地址或查询未命中。";

  return (
    <main className={workspace.page}>
      <header className={workspace.heading}>
        <div>
          <h1>访问看板</h1>
          <p>
            按北京时间查看主站访客、页面访问以及国家和中国大陆省份分布。
          </p>
        </div>
        <nav className={styles.rangeTabs} aria-label="统计周期">
          {rangeOptions.map((option) => (
            <Link
              className={`${styles.rangeTab} ${
                option.days === rangeDays ? styles.rangeTabActive : ""
              }`}
              href={`/visits?days=${option.days}`}
              key={option.days}
              aria-current={
                option.days === rangeDays ? "page" : undefined
              }
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </header>

      <section
        className={styles.metrics}
        aria-label="访问概览"
      >
        <article className={styles.metric}>
          <span>今日访客</span>
          <strong>{numberFormatter.format(dashboard.today.uv)}</strong>
          <small>今日去重浏览器访客（UV）</small>
        </article>
        <article className={styles.metric}>
          <span>今日访问</span>
          <strong>{numberFormatter.format(dashboard.today.pv)}</strong>
          <small>今日成功页面浏览（PV）</small>
        </article>
        <article className={styles.metric}>
          <span>{rangeDays} 天访客</span>
          <strong>{numberFormatter.format(dashboard.period.uv)}</strong>
          <small>周期内跨地域全局去重</small>
        </article>
        <article className={styles.metric}>
          <span>{rangeDays} 天访问</span>
          <strong>{numberFormatter.format(dashboard.period.pv)}</strong>
          <small>周期内累计页面浏览</small>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>每日访问趋势</h2>
            <p>同一访客每日只计一次 UV，页面切换分别计入 PV。</p>
          </div>
          <div className={styles.legend} aria-label="图例">
            <span>
              <i className={styles.legendUv} aria-hidden="true" />
              访客 UV
            </span>
            <span>
              <i className={styles.legendPv} aria-hidden="true" />
              访问 PV
            </span>
          </div>
        </div>
        {dashboard.period.pv > 0 ? (
          <div
            className={styles.chartScroll}
            role="img"
            aria-label={`${rangeDays} 天每日访客和访问趋势`}
          >
            <div
              className={styles.chart}
              style={
                {
                  "--day-count": dashboard.daily.length
                } as CSSProperties
              }
            >
              {dashboard.daily.map((row, index) => {
                const uvHeight = (row.uv / maxDaily) * 100;
                const pvHeight = (row.pv / maxDaily) * 100;
                const labelEvery =
                  rangeDays === 7 ? 1 : rangeDays === 30 ? 5 : 15;
                return (
                  <div
                    className={styles.day}
                    key={row.date}
                    aria-label={`${row.date}：访客 ${row.uv}，访问 ${row.pv}`}
                  >
                    <div className={styles.bars} aria-hidden="true">
                      <span
                        className={styles.uvBar}
                        style={{ height: `${uvHeight}%` }}
                      />
                      <span
                        className={styles.pvBar}
                        style={{ height: `${pvHeight}%` }}
                      />
                    </div>
                    <span className={styles.dayLabel}>
                      {index % labelEvery === 0 ||
                      index === dashboard.daily.length - 1
                        ? shortDate(row.date)
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={workspace.empty}>
            <strong>所选周期暂无访问</strong>
            <p>主站产生首个页面浏览后，这里会显示每日趋势。</p>
          </div>
        )}
      </section>

      <div className={styles.geographyGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>访问 IP 国家或地区</h2>
              <p>该表按页面访问时的 IP 统计，不读取用户档案地区。</p>
            </div>
          </div>
          {dashboard.countries.length ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>国家或地区</th>
                    <th>访客 UV</th>
                    <th>访问 PV</th>
                    <th>PV 占比</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.countries.map((row) => (
                    <tr key={row.countryCode}>
                      <td>
                        <strong>{row.name}</strong>
                        <small>{row.countryCode}</small>
                      </td>
                      <td>{numberFormatter.format(row.uv)}</td>
                      <td>{numberFormatter.format(row.pv)}</td>
                      <td>
                        {percentage(row.pv, dashboard.period.pv)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={workspace.empty}>
              <strong>暂无地域数据</strong>
              <p>访问事件接收后会按国家或地区自动汇总。</p>
            </div>
          )}
          {hasUnknown ? (
            <p className={`${styles.dataNote} ${styles.dataNoteWarning}`}>
              {unknownCopy}
            </p>
          ) : null}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>中国大陆省份</h2>
              <p>仅统计国家码为 CN 的访问。</p>
            </div>
          </div>
          {dashboard.chinaRegions.length ? (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>省份</th>
                    <th>访客 UV</th>
                    <th>访问 PV</th>
                    <th>大陆 PV 占比</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.chinaRegions.map((row) => (
                    <tr key={row.region}>
                      <td>
                        <strong>{row.region}</strong>
                      </td>
                      <td>{numberFormatter.format(row.uv)}</td>
                      <td>{numberFormatter.format(row.pv)}</td>
                      <td>{percentage(row.pv, chinaPv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={workspace.empty}>
              <strong>暂无中国大陆省份数据</strong>
              <p>GeoLite2 City 识别到大陆访问后会展示省份排行。</p>
            </div>
          )}
        </section>
      </div>

      <section className={`${styles.panel} ${styles.userCountryPanel}`}>
        <div className={styles.panelHeader}>
          <div>
            <h2>注册用户运营归因国家</h2>
            <p>按注册用户档案中的运营归因国家统计。</p>
          </div>
        </div>
        {userSummary.countries.length ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>国家或地区</th>
                  <th>注册用户数</th>
                  <th>用户占比</th>
                </tr>
              </thead>
              <tbody>
                {userSummary.countries.map((row) => (
                  <tr key={row.countryCode}>
                    <td>
                      <strong>{row.name}</strong>
                      <small>{row.countryCode}</small>
                    </td>
                    <td>{numberFormatter.format(row.users)}</td>
                    <td>{percentage(row.users, userSummary.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={workspace.empty}>
            <strong>暂无注册用户归因数据</strong>
            <p>用户档案同步归因国家后会展示国家分布。</p>
          </div>
        )}
      </section>
    </main>
  );
}
