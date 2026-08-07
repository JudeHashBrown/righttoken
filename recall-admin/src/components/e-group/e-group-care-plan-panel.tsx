"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EGroupSelectedUser } from "@/modules/e-group/types";
import styles from "@/components/a-group/a-group.module.css";
import eStyles from "./e-group.module.css";

const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;

export function EGroupCarePlanPanel({ user }: { user: EGroupSelectedUser }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/e-group/users/${user.id}/care-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: form.get("body") })
    });
    setPending(false);
    setMessage(response.ok ? "个性化维护方案已保存" : "方案保存失败，请重试");
    if (response.ok) router.refresh();
  }
  return (
    <section className={styles.panel}>
      <div className={eStyles.panelTitleRow}>
        <div><h2>个性化维护方案</h2><p>累计充值 {money(user.totalPaidMinor, user.balanceCurrency)}</p></div>
      </div>
      <div className={eStyles.rechargeTable}>
        <div className={eStyles.tableHead}><span>充值时间</span><span>充值金额</span><span>赠送明细</span></div>
        {user.rechargeHistory.length ? user.rechargeHistory.map((item) => (
          <div className={eStyles.tableRow} key={item.id}>
            <time>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(item.occurredAt)}</time>
            <strong>{money(item.amountMinor, item.currency)}</strong>
            <span>{item.giftDetail}</span>
          </div>
        )) : <p className={eStyles.emptyState}>暂无可用的充值明细</p>}
      </div>
      {user.latestCarePlan ? (
        <div className={eStyles.latestPlan}>
          <strong>当前方案</strong>
          <p>{user.latestCarePlan.body}</p>
          <small>{user.latestCarePlan.authorName} · {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" }).format(user.latestCarePlan.createdAt)}</small>
        </div>
      ) : null}
      <form className={eStyles.carePlanForm} onSubmit={submit}>
        <label htmlFor="care-plan-body">最新个性化维护方案</label>
        <textarea id="care-plan-body" aria-label="最新个性化维护方案" className={styles.textarea} name="body" placeholder="结合用户充值历史、当前余额和沟通原因填写维护方案" required />
        <div className={styles.actions}>
          {message ? <span role="status">{message}</span> : null}
          <button className={styles.primary} disabled={pending}>{pending ? "保存中…" : "保存最新方案"}</button>
        </div>
      </form>
    </section>
  );
}
