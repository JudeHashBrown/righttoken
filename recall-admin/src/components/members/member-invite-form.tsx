"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole } from "@/generated/prisma/client";
import styles from "@/components/workspaces/workspace.module.css";

type MemberInviteFormProps = {
  viewerRole: MemberRole;
};

async function readError(response: Response): Promise<string> {
  const result = (await response.json().catch(() => null)) as {
    code?: string;
    error?: { message?: string };
  } | null;

  if (result?.code === "FORBIDDEN") {
    return "当前账号没有邀请该角色的权限。";
  }
  if (result?.code === "RIGHTTOKEN_USER_NOT_FOUND") {
    return "没有找到该邮箱对应的 RightToken 用户，请先确认对方已经在主站注册。";
  }
  if (result?.code === "MEMBER_ALREADY_ACTIVE") {
    return "该用户已经拥有用户运营后台权限。";
  }
  return "操作未完成，请检查信息后重试。";
}

export function MemberInviteForm({
  viewerRole
}: MemberInviteFormProps): React.JSX.Element {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch("/api/members/access", {
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

      setSuccess(true);
      form.reset();
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
          <h2>添加成员权限</h2>
          <p>只能添加已经注册 RightToken 的用户</p>
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
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {success ? (
          <div className={styles.invitationResult}>
            <strong>成员权限已添加</strong>
            <p>该成员从 RightToken 主站进入时会自动使用现有登录状态。</p>
          </div>
        ) : null}

        <div className={styles.inlineActions}>
          <button
            className={styles.button}
            type="submit"
            disabled={submitting}
          >
            {submitting ? "正在添加" : "添加成员"}
          </button>
        </div>
      </form>
    </section>
  );
}
