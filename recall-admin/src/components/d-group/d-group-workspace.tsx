"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { DGroupWorkspaceData } from "@/modules/d-group/types";
import { DGroupProgress, type DGroupPanel } from "./d-group-progress";
import { DGroupInquiryPanel } from "./d-group-inquiry-panel";
import { DGroupContactPanel } from "./d-group-contact-panel";
import { DGroupGuidancePanel } from "./d-group-guidance-panel";
import { DGroupMaintenancePanel } from "./d-group-maintenance-panel";
import styles from "@/components/a-group/a-group.module.css";

type Mailbox = { id: string; name: string; emailAddress: string };
type Template = { id: string; name: string; subject: string; bodyText: string };
const countryName = (code: string | null) => code ? new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code) ?? code : "未知";

export function DGroupWorkspace({ initialData, mailboxes, templates }: {
  initialData: DGroupWorkspaceData;
  mailboxes: Mailbox[];
  templates: Template[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<DGroupPanel | null>(null);
  const users = useMemo(() => initialData.users.filter((user) => `${user.registrationSequence} ${user.email} ${user.displayName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [initialData.users, query]);
  const selected = initialData.selectedUser;
  function select(id: string) { router.push(`/groups/d?userId=${encodeURIComponent(id)}`); setActive(null); }
  return (
    <main className={styles.page}>
      <header><h1>D-长期未调用</h1><p className={styles.reasons}><span>可能暂时没有适合的调用场景</span><span>可能遇到配置或使用问题</span><span>也可能充值后忘记了平台的存在</span></p></header>
      <section className={styles.workspace}>
        <aside className={styles.queue}>
          <div className={styles.queueTitle}><strong>D组用户</strong><span>{initialData.users.length}</span></div>
          <label className={styles.search}><Search size={14} /><input onChange={(event) => setQuery(event.target.value)} placeholder="用户名、关键词或序号" value={query} /></label>
          <div>{users.map((user) => <button className={`${styles.user} ${selected?.id === user.id ? styles.selected : ""}`} key={user.id} onClick={() => select(user.id)}><span><strong>{user.displayName || `#${user.registrationSequence}`}</strong><small>{countryName(user.countryCode)}</small></span><em>{user.email}</em></button>)}</div>
        </aside>
        <div className={styles.detail}>
          {selected ? <>
            <DGroupProgress user={selected} active={active} onSelect={(panel) => setActive(active === panel ? null : panel)} />
            {active === "inquiry" ? <DGroupInquiryPanel user={selected} mailboxes={mailboxes} templates={templates} /> : null}
            {active === "contact" ? <DGroupContactPanel user={selected} /> : null}
            {active === "guidance" ? <DGroupGuidancePanel user={selected} /> : null}
            {active === "maintenance" ? <DGroupMaintenancePanel user={selected} /> : null}
            {!active ? <div className={styles.empty}>点击上方步骤处理当前用户</div> : null}
          </> : <div className={styles.empty}>暂无长期未调用的用户</div>}
        </div>
      </section>
    </main>
  );
}
