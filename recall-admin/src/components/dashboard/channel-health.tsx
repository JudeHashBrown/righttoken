import { Bot, Mail, ShieldCheck } from "lucide-react";
import type { DashboardSnapshot } from "@/modules/reports/dashboard-query";
import styles from "./dashboard.module.css";

type ChannelHealthProps = {
  rows: DashboardSnapshot["channelHealth"];
};

const icons = [Mail, Mail, Bot];

export function ChannelHealth({
  rows
}: ChannelHealthProps): React.JSX.Element {
  return (
    <section className={styles.panel} aria-labelledby="channel-heading">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="channel-heading">渠道健康</h2>
          <p>邮箱与运营提醒连接状态</p>
        </div>
        <ShieldCheck aria-hidden="true" size={18} />
      </header>
      <div className={styles.healthList}>
        {rows.map((row, index) => {
          const Icon = icons[index] ?? Mail;
          return (
            <div className={styles.healthRow} key={row.channel}>
              <span className={styles.healthIcon}>
                <Icon aria-hidden="true" size={17} />
              </span>
              <span className={styles.healthName}>{row.channel}</span>
              <span
                className={`${styles.healthState} ${
                  styles[`health${row.state}`]
                }`}
              >
                <i aria-hidden="true" />
                {row.detail}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
