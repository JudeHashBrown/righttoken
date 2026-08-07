"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EGroupSelectedUser } from "@/modules/e-group/types";
import styles from "@/components/a-group/a-group.module.css";

const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

export function EGroupMaintenancePanel({ user }: { user: EGroupSelectedUser }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError(null);
    const form = new FormData(formElement);
    const response = await fetch(`/api/e-group/users/${user.id}/maintenance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ occurredOn: form.get("occurredOn"), body: form.get("body") })
    });
    setPending(false);
    if (!response.ok) { setError("维护记录未能保存，请重试。"); return; }
    formElement.reset();
    router.refresh();
  }
  return (
    <section className={styles.panel}>
      <h2>日常维护</h2>
      <form className={styles.maintenanceForm} onSubmit={submit}>
        <input aria-label="维护日期" className={styles.input} defaultValue={today()} name="occurredOn" type="date" />
        <input aria-label="维护内容" className={styles.input} name="body" placeholder="填写本次维护内容" required />
        <button className={styles.primary} disabled={pending}>{pending ? "保存中…" : "保存记录"}</button>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.recordHead}><span>日期</span><span>维护记录</span></div>
      <div className={styles.records}>
        {user.maintenanceRecords.map((record) => (
          <div className={styles.record} key={record.id}>
            <time>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(record.occurredAt)}</time>
            <p>{record.body}{record.effective ? "" : "（已退信，不计入有效维护）"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
