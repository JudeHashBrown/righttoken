"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EGroupSelectedUser } from "@/modules/e-group/types";
import styles from "@/components/a-group/a-group.module.css";

export function EGroupContactPanel({ user }: { user: EGroupSelectedUser }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/e-group/users/${user.id}/contact`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wechatId: form.get("wechatId"),
        telegramHandle: form.get("telegramHandle")
      })
    });
    setPending(false);
    setMessage(response.ok ? "联系方式已保存" : "保存失败，请检查填写内容");
    if (response.ok) router.refresh();
  }

  return (
    <section className={styles.panel}>
      <h2>登记联系方式</h2>
      <p className={styles.panelHint}>记录客户的微信或 Telegram，便于后续催促复充。</p>
      <form onSubmit={submit}>
        <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <label>微信号<input aria-label="微信号" className={styles.input} defaultValue={user.contact?.wechatId ?? ""} name="wechatId" /></label>
          <label>Telegram<input aria-label="Telegram" className={styles.input} defaultValue={user.contact?.telegramHandle ?? ""} name="telegramHandle" placeholder="例如 @username" /></label>
        </div>
        <div className={styles.actions}>
          {message ? <span role="status">{message}</span> : null}
          <button className={styles.primary} disabled={pending}>{pending ? "保存中…" : "保存联系方式"}</button>
        </div>
      </form>
    </section>
  );
}
