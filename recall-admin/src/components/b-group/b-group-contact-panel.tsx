"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { BGroupSelectedUser } from "@/modules/b-group/types";
import styles from "./b-group.module.css";

export function BGroupContactPanel({ user }: { user: BGroupSelectedUser }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(null); const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/b-group/users/${user.id}/contact`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ wechatId: form.get("wechatId"), telegramHandle: form.get("telegramHandle"), phoneCountryCode: form.get("phoneCountryCode"), phoneNumber: form.get("phoneNumber") }) });
    setPending(false); if (!response.ok) { setMessage("联系方式未能保存，请检查填写内容。"); return; } setMessage("联系方式已保存"); router.refresh();
  }
  return <section className={styles.panel}><h2>登记联系方式</h2><p className={styles.panelHint}>填写任意一种联系方式即可保存，保存后跨分组保留。</p><form onSubmit={submit}><div className={styles.formGrid}><label>微信号<input aria-label="微信号" className={styles.input} defaultValue={user.contact?.wechatId ?? ""} name="wechatId" /></label><label>Telegram<input aria-label="Telegram" className={styles.input} defaultValue={user.contact?.telegramHandle ?? ""} name="telegramHandle" placeholder="例如 @username" /></label><label>手机号<span className={styles.phoneRow}><input aria-label="国家区号" className={styles.input} defaultValue={user.contact?.phoneCountryCode ?? ""} name="phoneCountryCode" placeholder="+86" /><input aria-label="手机号" className={styles.input} defaultValue={user.contact?.phoneNumber ?? ""} name="phoneNumber" /></span></label></div><div className={styles.actions}>{message ? <span role="status">{message}</span> : null}<button className={styles.primary} disabled={pending}>{pending ? "保存中…" : "保存联系方式"}</button></div></form></section>;
}
