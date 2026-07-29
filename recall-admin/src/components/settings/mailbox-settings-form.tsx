"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

export function MailboxSettingsForm(): React.JSX.Element {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/integrations/mailboxes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          provider: data.get("provider"),
          enabled: data.get("enabled") === "on",
          config: {
            emailAddress: data.get("emailAddress"),
            displayName: data.get("displayName"),
            username: data.get("username"),
            password: data.get("password"),
            smtp: {
              host: data.get("smtpHost"),
              port: Number(data.get("smtpPort")),
              secure: data.get("smtpSecure") === "on"
            },
            imap: {
              host: data.get("imapHost"),
              port: Number(data.get("imapPort")),
              secure: data.get("imapSecure") === "on"
            }
          }
        })
      });
      if (!response.ok) {
        setError("邮箱连接未保存，请检查账号和收发邮件设置。");
        return;
      }
      setSuccess("邮箱连接已安全保存");
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>连接客服邮箱</h2>
          <p>密码会加密保存，保存后页面不会再次显示</p>
        </div>
      </div>
      <form className={styles.formBody} onSubmit={handleSubmit}>
        <div className={styles.editorGrid}>
          <div className={styles.field}>
            <label htmlFor="mailbox-provider">邮箱类型</label>
            <select
              className={styles.select}
              id="mailbox-provider"
              name="provider"
              defaultValue="NAMECHEAP"
              disabled={submitting}
            >
              <option value="NAMECHEAP">Namecheap Private Email</option>
              <option value="WECOM_MAIL">企业微信邮箱</option>
              <option value="CUSTOM">其他邮箱（手动设置）</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="mailbox-name">连接名称</label>
            <input
              className={styles.input}
              id="mailbox-name"
              name="name"
              defaultValue="Namecheap 客服邮箱"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="mailbox-display-name">发件人名称</label>
            <input
              className={styles.input}
              id="mailbox-display-name"
              name="displayName"
              defaultValue="RightToken 客服"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="mailbox-address">对外显示的邮箱地址</label>
            <input
              className={styles.input}
              id="mailbox-address"
              name="emailAddress"
              type="email"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="mailbox-username">
              登录账号（通常与邮箱地址相同）
            </label>
            <input
              className={styles.input}
              id="mailbox-username"
              name="username"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="mailbox-password">邮箱密码</label>
            <input
              className={styles.input}
              id="mailbox-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="smtp-host">发件服务器地址</label>
            <input
              className={styles.input}
              id="smtp-host"
              name="smtpHost"
              defaultValue="mail.privateemail.com"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="smtp-port">发件服务器端口</label>
            <input
              className={styles.input}
              id="smtp-port"
              name="smtpPort"
              type="number"
              defaultValue="465"
              min="1"
              max="65535"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="imap-host">收件服务器地址</label>
            <input
              className={styles.input}
              id="imap-host"
              name="imapHost"
              defaultValue="mail.privateemail.com"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="imap-port">收件服务器端口</label>
            <input
              className={styles.input}
              id="imap-port"
              name="imapPort"
              type="number"
              defaultValue="993"
              min="1"
              max="65535"
              required
              disabled={submitting}
            />
          </div>
        </div>
        <div className={styles.inlineActions}>
          <label className={styles.toggle}>
            <input
              name="smtpSecure"
              type="checkbox"
              defaultChecked
              disabled={submitting}
            />
            发件服务器使用安全连接
          </label>
          <label className={styles.toggle}>
            <input
              name="imapSecure"
              type="checkbox"
              defaultChecked
              disabled={submitting}
            />
            收件服务器使用安全连接
          </label>
          <label className={styles.toggle}>
            <input
              name="enabled"
              type="checkbox"
              defaultChecked
              disabled={submitting}
            />
            保存后启用
          </label>
        </div>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className={styles.success} role="status">
            {success}
          </p>
        ) : null}
        <div className={styles.inlineActions}>
          <button
            className={styles.button}
            type="submit"
            disabled={submitting}
          >
            {submitting ? "正在保存" : "保存邮箱连接"}
          </button>
        </div>
      </form>
    </section>
  );
}
