"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DGroupSelectedUser, GuidanceCategory } from "@/modules/d-group/types";
import styles from "@/components/a-group/a-group.module.css";
import dStyles from "./d-group.module.css";

const categories: Array<{ value: GuidanceCategory; label: string }> = [
  { value: "GROUP_GUIDANCE", label: "拉群指导" },
  { value: "TUTORIAL", label: "发教程" },
  { value: "PERSONALIZED_PROMOTION", label: "个性化促销方案" }
];
const labelOf = (value: GuidanceCategory) => categories.find((item) => item.value === value)?.label ?? "发教程";

export function DGroupGuidancePanel({ user, apiBase = "/api/d-group", hint }: {
  user: DGroupSelectedUser;
  apiBase?: string;
  hint?: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<GuidanceCategory>("GROUP_GUIDANCE");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setMessage(null);
    const response = await fetch(`${apiBase}/users/${user.id}/guidance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category, body: form.get("body") })
    });
    setPending(false);
    setMessage(response.ok ? "辅导记录已保存" : "辅导记录保存失败，请重试");
    if (response.ok) { formElement.reset(); router.refresh(); }
  }
  return (
    <section className={styles.panel}>
      <h2>详细辅导</h2>
      <p className={styles.panelHint}>{hint ?? "根据客户的未调用原因，选择拉群指导、发送教程或制定个性化促销方案。"}</p>
      <form className={dStyles.guidanceForm} onSubmit={submit}>
        <fieldset className={dStyles.categoryPicker}>
          <legend>辅导方式</legend>
          {categories.map((item) => <label key={item.value}><input checked={category === item.value} name="category" onChange={() => setCategory(item.value)} type="radio" value={item.value} />{item.label}</label>)}
        </fieldset>
        <label>辅导记录<textarea aria-label="辅导记录" className={styles.textarea} name="body" placeholder="填写具体指导内容、教程链接、群聊安排或促销方案" required /></label>
        <div className={styles.actions}>{message ? <span role="status">{message}</span> : null}<button className={styles.primary} disabled={pending}>{pending ? "保存中…" : "保存辅导记录"}</button></div>
      </form>
      <div className={dStyles.guidanceRecords}>{user.guidanceRecords.map((item) => <div className={dStyles.guidanceItem} key={item.id}><span>{labelOf(item.category)}</span><p>{item.body}</p><small>{item.actorName} · {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" }).format(item.createdAt)}</small></div>)}</div>
    </section>
  );
}
