"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { EGroupWorkspaceData } from "@/modules/e-group/types";
import { EGroupProgress, type EGroupPanel } from "./e-group-progress";
import { EGroupContactPanel } from "./e-group-contact-panel";
import { EGroupOutreachPanel } from "./e-group-outreach-panel";
import { EGroupCarePlanPanel } from "./e-group-care-plan-panel";
import { EGroupMaintenancePanel } from "./e-group-maintenance-panel";
import styles from "@/components/a-group/a-group.module.css";

type Mailbox = { id: string; name: string; emailAddress: string };
type Template = { id: string; name: string; subject: string; bodyText: string };

const countryName = (code: string | null) => code
  ? new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code) ?? code
  : "未知";

export function EGroupWorkspace({ initialData, mailboxes, templates }: {
  initialData: EGroupWorkspaceData;
  mailboxes: Mailbox[];
  templates: Template[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<EGroupPanel | null>(null);
  const users = useMemo(() => initialData.users.filter((user) =>
    `${user.registrationSequence} ${user.email} ${user.displayName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [initialData.users, query]);
  const selected = initialData.selectedUser;
  function select(id: string) { router.push(`/groups/e?userId=${encodeURIComponent(id)}`); setActive(null); }
  return (
    <main className={styles.page}>
      <header><h1>E-余额不足</h1><p className={styles.reasons}><span>当前余额不足以继续调用</span><span>优先了解未复充原因</span><span>结合充值历史制定维护方案</span></p></header>
      <section className={styles.workspace}>
        <aside className={styles.queue}>
          <div className={styles.queueTitle}><strong>E组用户</strong><span>{initialData.users.length}</span></div>
          <label className={styles.search}><Search size={14} /><input onChange={(event) => setQuery(event.target.value)} placeholder="用户名、关键词或序号" value={query} /></label>
          <div>{users.map((user) => (
            <button className={`${styles.user} ${selected?.id === user.id ? styles.selected : ""}`} key={user.id} onClick={() => select(user.id)}>
              <span><strong>{user.displayName || `#${user.registrationSequence}`}</strong><small>{countryName(user.countryCode)}</small></span><em>{user.email}</em>
            </button>
          ))}</div>
        </aside>
        <div className={styles.detail}>
          {selected ? <>
            <EGroupProgress user={selected} active={active} onSelect={(panel) => setActive(active === panel ? null : panel)} />
            {active === "contact" ? <EGroupContactPanel user={selected} /> : null}
            {active === "outreach" ? <EGroupOutreachPanel user={selected} mailboxes={mailboxes} templates={templates} /> : null}
            {active === "carePlan" ? <EGroupCarePlanPanel user={selected} /> : null}
            {active === "maintenance" ? <EGroupMaintenancePanel user={selected} /> : null}
            {!active ? <div className={styles.empty}>点击上方步骤处理当前用户</div> : null}
          </> : <div className={styles.empty}>暂无余额不足的用户</div>}
        </div>
      </section>
    </main>
  );
}
