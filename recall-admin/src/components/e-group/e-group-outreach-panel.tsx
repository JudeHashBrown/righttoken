"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle } from "lucide-react";
import type { EGroupSelectedUser } from "@/modules/e-group/types";
import styles from "@/components/a-group/a-group.module.css";
import eStyles from "./e-group.module.css";

type Mailbox = { id: string; name: string; emailAddress: string };
type Template = { id: string; name: string; subject: string; bodyText: string };

const dateTime = (date: Date) => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
}).format(date);

export function EGroupOutreachPanel({ user, mailboxes, templates }: {
  user: EGroupSelectedUser;
  mailboxes: Mailbox[];
  templates: Template[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"mail" | "wechat" | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

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
        purpose: "PAYMENT_FOLLOW_UP", subject, bodyText: body
      })
    });
    setPending(false);
    setMessage(response.ok ? "催促复充邮件已发送" : "邮件发送失败，请检查邮箱状态");
    if (response.ok) { setSubject(""); setBody(""); router.refresh(); }
  }

  async function saveWechat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setMessage(null);
    let assetId: string | null = null;
    const screenshot = form.get("screenshot");
    if (screenshot instanceof File && screenshot.size > 0) {
      const upload = new FormData();
      upload.set("file", screenshot);
      const uploadResponse = await fetch("/api/mail/assets", { method: "POST", body: upload });
      if (!uploadResponse.ok) {
        setPending(false);
        setMessage("截图上传失败，请换一张图片后重试");
        return;
      }
      const uploadData = await uploadResponse.json() as { asset: { id: string } };
      assetId = uploadData.asset.id;
    }
    const response = await fetch(`/api/e-group/users/${user.id}/outreach`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: form.get("reason"), body: form.get("body"), assetId })
    });
    setPending(false);
    setMessage(response.ok ? "微信催促记录已保存" : "催促记录保存失败，请重试");
    if (response.ok) { formElement.reset(); router.refresh(); }
  }

  return (
    <section className={styles.panel}>
      <h2>催促复充</h2>
      <p className={styles.panelHint}>选择邮件或微信联系客户，询问余额不足和未复充的原因，并保留完整记录。</p>
      <div className={eStyles.channelChoices}>
        <button className={`${eStyles.channelButton} ${mode === "mail" ? eStyles.channelActive : ""}`} onClick={() => { setMode("mail"); setMessage(null); }} type="button"><Mail size={18} />邮件催</button>
        <button className={`${eStyles.channelButton} ${mode === "wechat" ? eStyles.channelActive : ""}`} onClick={() => { setMode("wechat"); setMessage(null); }} type="button"><MessageCircle size={18} />微信催</button>
      </div>
      {mode === "mail" ? (
        <form className={styles.mailGrid} onSubmit={sendMail}>
          <div className={styles.mailMain}>
            <h3>邮件催促复充</h3>
            <input className={styles.input} disabled value={user.email} />
            <input aria-label="邮件主题" className={styles.input} onChange={(event) => setSubject(event.target.value)} required value={subject} />
            <textarea aria-label="邮件正文" className={styles.textarea} onChange={(event) => setBody(event.target.value)} required value={body} />
          </div>
          <aside className={styles.mailTools}>
            <select aria-label="邮件模板" className={styles.input} defaultValue="" onChange={(event) => applyTemplate(event.target.value)}>
              <option value="">选择邮件模板</option>
              {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select aria-label="发件邮箱" className={styles.input} name="mailboxId" required>
              {mailboxes.map((box) => <option key={box.id} value={box.id}>{box.name}</option>)}
            </select>
            <button className={styles.primary} disabled={pending || !mailboxes.length}>{pending ? "发送中…" : "审核并发送"}</button>
          </aside>
        </form>
      ) : null}
      {mode === "wechat" ? (
        <form className={eStyles.wechatForm} onSubmit={saveWechat}>
          <label>用户未复充原因<textarea aria-label="用户未复充原因" className={styles.textarea} name="reason" placeholder="询问后记录用户反馈的原因" /></label>
          <label>催促过程描述<textarea aria-label="催促过程描述" className={styles.textarea} name="body" placeholder="填写微信沟通过程、承诺和下一步" required /></label>
          <label className={eStyles.fileField}>沟通截图<input aria-label="沟通截图" accept="image/*" name="screenshot" type="file" /></label>
          <button className={styles.primary} disabled={pending}>{pending ? "保存中…" : "保存微信催促记录"}</button>
        </form>
      ) : null}
      {message ? <p role="status" className={eStyles.status}>{message}</p> : null}
      <div className={eStyles.historyGrid}>
        <section>
          <h3>邮件催促记录</h3>
          {user.outreach.mail.length ? user.outreach.mail.map((item) => (
            <div className={eStyles.historyItem} key={item.id}><strong>{item.subject}</strong><span>{item.status} · {dateTime(item.occurredAt)}</span></div>
          )) : <p className={eStyles.emptyState}>暂无邮件催促记录</p>}
        </section>
        <section>
          <h3>微信催促记录</h3>
          {user.outreach.wechat.length ? user.outreach.wechat.map((item) => (
            <div className={eStyles.historyItem} key={item.id}>
              <strong>{item.reason || "未填写用户原因"}</strong><p>{item.body}</p>
              <span>{item.actorName} · {dateTime(item.occurredAt)}{item.asset ? <> · <a href={`/api/mail/assets/${item.asset.id}`} target="_blank" rel="noreferrer">查看截图</a></> : null}</span>
            </div>
          )) : <p className={eStyles.emptyState}>暂无微信催促记录</p>}
        </section>
      </div>
    </section>
  );
}
