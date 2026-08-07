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

export function DGroupWorkspace({ initialData, mailboxes, templates, groupCode = "D" }: {
  initialData: DGroupWorkspaceData;
  mailboxes: Mailbox[];
  templates: Template[];
  groupCode?: "C" | "D";
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<DGroupPanel | null>(null);
  const isCGroup = groupCode === "C";
  const apiBase = isCGroup ? "/api/c-group" : "/api/d-group";
  const users = useMemo(() => initialData.users.filter((user) => `${user.registrationSequence} ${user.email} ${user.displayName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [initialData.users, query]);
  const selected = initialData.selectedUser;
  function select(id: string) { router.push(`/groups/${groupCode.toLowerCase()}?userId=${encodeURIComponent(id)}`); setActive(null); }
  return (
    <main className={styles.page}>
      <header>
        <h1>{isCGroup ? "C-充值未调用" : "D-长期未调用"}</h1>
        <p className={styles.reasons}>{isCGroup ? <>
          <span>刚完成充值，可能还不熟悉调用方式</span>
          <span>此时发送询问邮件，更容易快速获得回复</span>
        </> : <>
          <span>可能暂时没有适合的调用场景</span>
          <span>可能遇到配置或使用问题</span>
          <span>也可能充值后忘记了平台的存在</span>
        </>}</p>
      </header>
      <section className={styles.workspace}>
        <aside className={styles.queue}>
          <div className={styles.queueTitle}><strong>{groupCode}组用户</strong><span>{initialData.users.length}</span></div>
          <label className={styles.search}><Search size={14} /><input onChange={(event) => setQuery(event.target.value)} placeholder="用户名、关键词或序号" value={query} /></label>
          <div>{users.map((user) => <button className={`${styles.user} ${selected?.id === user.id ? styles.selected : ""}`} key={user.id} onClick={() => select(user.id)}><span><strong>{user.displayName || `#${user.registrationSequence}`}</strong><small>{countryName(user.countryCode)}</small></span><em>{user.email}</em></button>)}</div>
        </aside>
        <div className={styles.detail}>
          {selected ? <>
            <DGroupProgress user={selected} active={active} onSelect={(panel) => setActive(active === panel ? null : panel)} />
            {active === "inquiry" ? <DGroupInquiryPanel
              user={selected}
              mailboxes={mailboxes}
              templates={templates}
              apiBase={apiBase}
              copy={isCGroup ? {
                subject: "协助您完成 RightToken 首次调用",
                body: "您好，我们注意到您刚完成充值，但还没有开始调用 RightToken。您可能还不熟悉调用方式，如果在配置 API 或首次调用时遇到问题，欢迎直接回复这封邮件，或添加我们的微信/TG，我们会立即协助您完成首次调用。",
                hint: "客户刚完成充值但尚未调用，很可能是不熟悉调用方式；此时优先发邮件询问，通常更容易快速获得回复。",
                reasonPlaceholder: "例如：不熟悉调用方式、不会配置 API、首次调用报错"
              } : undefined}
            /> : null}
            {active === "contact" ? <DGroupContactPanel user={selected} apiBase={apiBase} /> : null}
            {active === "guidance" ? <DGroupGuidancePanel user={selected} apiBase={apiBase} hint={isCGroup ? "优先帮助客户完成首次调用，可选择拉群指导、发送教程或制定个性化促销方案。" : undefined} /> : null}
            {active === "maintenance" ? <DGroupMaintenancePanel user={selected} apiBase={apiBase} /> : null}
            {!active ? <div className={styles.empty}>点击上方步骤处理当前用户</div> : null}
          </> : <div className={styles.empty}>{isCGroup ? "暂无充值后未调用的用户" : "暂无长期未调用的用户"}</div>}
        </div>
      </section>
    </main>
  );
}
