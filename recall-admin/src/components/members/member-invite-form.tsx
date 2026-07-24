"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole } from "@/generated/prisma/client";
import styles from "@/components/workspaces/workspace.module.css";

type MemberInviteFormProps = {
  viewerRole: MemberRole;
  twoFactorOn: boolean;
};

type InvitationResult = {
  token: string;
  expiresAt: string;
};

async function readError(response: Response): Promise<string> {
  const result = (await response.json().catch(() => null)) as {
    code?: string;
    error?: { message?: string };
  } | null;

  if (result?.code === "INVALID_REAUTHENTICATION") {
    return "当前账号密码或二次验证码不正确。";
  }
  if (result?.code === "FORBIDDEN") {
    return "当前账号没有邀请该角色的权限。";
  }
  return result?.error?.message ?? "操作未完成，请检查信息后重试。";
}

export function MemberInviteForm({
  viewerRole,
  twoFactorOn
}: MemberInviteFormProps): React.JSX.Element {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationResult | null>(
    null
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInvitation(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const reauthentication = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          password: formData.get("password"),
          code: twoFactorOn ? formData.get("code") : undefined
        })
      });
      if (!reauthentication.ok) {
        setError(await readError(reauthentication));
        return;
      }

      const response = await fetch("/api/members/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          role: formData.get("role")
        })
      });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const result = (await response.json()) as InvitationResult;
      setInvitation(result);
      form.reset();
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  const invitationUrl = invitation
    ? `${window.location.origin}/members/invitations/accept?token=${encodeURIComponent(invitation.token)}`
    : null;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>邀请成员</h2>
          <p>创建邀请前需验证当前管理员身份，邀请链接 48 小时有效</p>
        </div>
      </div>
      <form className={styles.formBody} onSubmit={handleSubmit}>
        <div className={styles.editorGrid}>
          <div className={styles.field}>
            <label htmlFor="invite-email">成员邮箱</label>
            <input
              className={styles.input}
              id="invite-email"
              name="email"
              type="email"
              autoComplete="off"
              required
              disabled={submitting}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="invite-role">成员角色</label>
            <select
              className={styles.select}
              id="invite-role"
              name="role"
              defaultValue="OPERATOR"
              disabled={submitting}
            >
              <option value="OPERATOR">运营人员</option>
              {viewerRole === "PRIMARY_ADMIN" ? (
                <option value="ADMIN">管理员</option>
              ) : null}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="invite-password">当前账号密码</label>
            <input
              className={styles.input}
              id="invite-password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={12}
              required
              disabled={submitting}
            />
          </div>
          {twoFactorOn ? (
            <div className={styles.field}>
              <label htmlFor="invite-code">二次验证码</label>
              <input
                className={styles.input}
                id="invite-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                minLength={6}
                required
                disabled={submitting}
              />
            </div>
          ) : null}
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {invitationUrl ? (
          <div className={styles.invitationResult}>
            <strong>邀请已创建，有效期 48 小时</strong>
            <p>邮件发送接通前，请复制下面的链接交给受邀成员。</p>
            <input
              className={styles.input}
              aria-label="邀请链接"
              readOnly
              value={invitationUrl}
            />
          </div>
        ) : null}

        <div className={styles.inlineActions}>
          <button
            className={styles.button}
            type="submit"
            disabled={submitting}
          >
            {submitting ? "正在创建" : "创建邀请"}
          </button>
        </div>
      </form>
    </section>
  );
}
