"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { DGroupSelectedUser } from "@/modules/d-group/types";
import styles from "@/components/a-group/a-group.module.css";
import dStyles from "./d-group.module.css";

type Mailbox = { id: string; name: string; emailAddress: string };
type Template = { id: string; name: string; subject: string; bodyText: string };

const defaultSubject = "想了解您近期未调用 RightToken 的原因";
const defaultBody = "您好，我们注意到您近期没有继续使用 RightToken。想了解是暂时没有使用场景、遇到操作问题，还是充值后忘记了平台？您也可以添加我们的微信/TG，我们会为您提供一对一指导。";
const dateTime = (date: Date) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);

export function DGroupInquiryPanel({ user, mailboxes, templates }: {
  user: DGroupSelectedUser;
  mailboxes: Mailbox[];
  templates: Template[];
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  function applyTemplate(id: string) {
    const template = templates.find((item) => item.id === id);
    if (template) { setSubject(template.subject); setBody(template.bodyText); }
  }
  async function sendMail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/mail/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mailboxId: form.get("mailboxId"), userId: user.id, recipient: user.email,
        purpose: "USAGE_FOLLOW_UP", subject, bodyText: body
      })
    });
    setPending(false);
    setMessage(response.ok ? "询问邮件已发送" : "邮件发送失败，请检查邮箱状态");
    if (response.ok) router.refresh();
  }
  async function saveReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/d-group/users/${user.id}/reason`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: form.get("body") })
    });
    setPending(false);
    setMessage(response.ok ? "未调用原因已保存" : "原因保存失败，请重试");
    if (response.ok) { formElement.reset(); router.refresh(); }
  }
  return (
    <section className={styles.panel}>
      <h2>邮件询问未调用原因</h2>
      <p className={styles.panelHint}>询问客户是否没有场景、遇到调用问题，或充值后忘记平台，并引导客户添加微信/TG。</p>
      <form className={styles.mailGrid} onSubmit={sendMail}>
        <div className={styles.mailMain}>
          <input className={styles.input} disabled value={user.email} />
          <input aria-label="邮件主题" className={styles.input} onChange={(event) => setSubject(event.target.value)} required value={subject} />
          <textarea aria-label="邮件正文" className={styles.textarea} onChange={(event) => setBody(event.target.value)} required value={body} />
        </div>
        <aside className={styles.mailTools}>
          <select aria-label="邮件模板" className={styles.input} defaultValue="" onChange={(event) => applyTemplate(event.target.value)}>
            <option value="">选择邮件模板</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select aria-label="发件邮箱" className={styles.input} name="mailboxId" required>{mailboxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}</select>
          <button className={styles.primary} disabled={pending || !mailboxes.length}>{pending ? "发送中…" : "审核并发送"}</button>
        </aside>
      </form>
      {message ? <p className={dStyles.status} role="status">{message}</p> : null}
      <div className={dStyles.inquiryHistory}>
        <section>
          <h3>邮件记录</h3>
          {user.inquiryMail.length ? user.inquiryMail.map((item) => <div className={dStyles.historyItem} key={item.id}><strong>{item.subject}</strong><span>{item.status} · {dateTime(item.occurredAt)}</span></div>) : <p className={dStyles.emptyState}>暂无询问邮件</p>}
        </section>
        <section>
          <h3>手工记录未调用原因</h3>
          <form className={dStyles.reasonForm} onSubmit={saveReason}>
            <textarea aria-label="未调用原因" className={styles.textarea} name="body" placeholder="例如：充值后忘记平台、暂时没有场景、不会配置 API" required />
            <button className={styles.primary} disabled={pending}>{pending ? "保存中…" : "保存原因"}</button>
          </form>
          {user.reasons.map((item) => <div className={dStyles.historyItem} key={item.id}><strong>{item.body}</strong><span>{item.actorName} · {dateTime(item.createdAt)}</span></div>)}
        </section>
      </div>
    </section>
  );
}
