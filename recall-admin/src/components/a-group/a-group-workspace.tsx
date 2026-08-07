"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { AGroupWorkspaceData } from "@/modules/a-group/types";
import {
  AGroupProgress,
  type AGroupPanel
} from "./a-group-progress";
import { AGroupContactPanel } from "./a-group-contact-panel";
import { AGroupMaintenancePanel } from "./a-group-maintenance-panel";
import { AGroupCouponPanel } from "./a-group-coupon-panel";
import { AGroupMailPanel } from "./a-group-mail-panel";
import styles from "./a-group.module.css";

type Mailbox = { id: string; name: string; emailAddress: string };
type Template = {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
};

const countryName = (code: string | null) =>
  code
    ? new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code) ??
      code
    : "未知";

export function AGroupWorkspace({
  initialData,
  mailboxes,
  templates
}: {
  initialData: AGroupWorkspaceData;
  mailboxes: Mailbox[];
  templates: Template[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<AGroupPanel | null>(null);
  const users = useMemo(
    () =>
      initialData.users.filter((user) =>
        `${user.registrationSequence} ${user.email}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      ),
    [initialData.users, query]
  );
  const selected = initialData.selectedUser;

  function select(id: string) {
    router.push(`/groups/a?userId=${encodeURIComponent(id)}`);
    setActive(null);
  }

  return (
    <main className={styles.page}>
      <header>
        <h1>A-仅注册</h1>
        <p className={styles.reasons}>
          <span>还不清楚 RightToken 的用途</span>
          <span>偶然在社交媒体看到，出于好奇注册</span>
          <span>浏览价格后认为价格偏高</span>
        </p>
      </header>
      <section className={styles.workspace}>
        <aside className={styles.queue}>
          <div className={styles.queueTitle}>
            <strong>A-仅注册用户</strong>
            <span>{initialData.users.length}</span>
          </div>
          <label className={styles.search}>
            <Search size={14} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="关键词或序号"
              value={query}
            />
          </label>
          <div>
            {users.map((user) => (
              <button
                className={`${styles.user} ${
                  selected?.id === user.id ? styles.selected : ""
                }`}
                key={user.id}
                onClick={() => select(user.id)}
              >
                <span>
                  <strong>#{user.registrationSequence}</strong>
                  <small>{countryName(user.countryCode)}</small>
                </span>
                <em>{user.email}</em>
              </button>
            ))}
          </div>
        </aside>
        <div className={styles.detail}>
          {selected ? (
            <>
              <AGroupProgress
                active={active}
                onSelect={(panel) =>
                  setActive(active === panel ? null : panel)
                }
                user={selected}
              />
              {active === "mail" ? (
                <AGroupMailPanel
                  user={selected}
                  mailboxes={mailboxes}
                  templates={templates}
                />
              ) : null}
              {active === "contact" ? (
                <AGroupContactPanel user={selected} />
              ) : null}
              {active === "coupon" ? (
                <AGroupCouponPanel user={selected} />
              ) : null}
              {active === "maintenance" ? (
                <AGroupMaintenancePanel user={selected} />
              ) : null}
              {!active ? (
                <div className={styles.empty}>
                  点击上方步骤处理当前用户
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>
              暂无新注册但未发起支付的用户
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
