"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole } from "@/generated/prisma/client";
import styles from "@/components/workspaces/workspace.module.css";

type MemberAccessActionsProps = {
  memberId: string;
  memberRole: MemberRole;
  memberName: string;
  active: boolean;
  viewerId: string;
  viewerRole: MemberRole;
  successorOptions: Array<{
    id: string;
    displayName: string;
    email: string;
    role: MemberRole;
  }>;
};

function roleLabel(role: MemberRole): string {
  if (role === "PRIMARY_ADMIN") return "主管理员";
  if (role === "ADMIN") return "管理员";
  return "运营人员";
}

function canRevoke(props: MemberAccessActionsProps): boolean {
  if (
    !props.active ||
    props.memberId === props.viewerId ||
    props.memberRole === "PRIMARY_ADMIN"
  ) {
    return false;
  }
  if (props.viewerRole === "PRIMARY_ADMIN") {
    return true;
  }
  return (
    props.viewerRole === "ADMIN" &&
    props.memberRole === "OPERATOR"
  );
}

export function MemberAccessActions(
  props: MemberAccessActionsProps
): React.JSX.Element | null {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [successorId, setSuccessorId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canRevoke(props)) {
    return null;
  }

  async function revoke(): Promise<void> {
    if (!successorId) {
      setError("请选择工作接管人。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/members/${props.memberId}/access`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ successorId })
        }
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        const messages: Record<string, string> = {
          SUCCESSOR_REQUIRED: "请选择工作接管人。",
          SUCCESSOR_NOT_FOUND: "没有找到所选接管人，请刷新后重试。",
          SUCCESSOR_INACTIVE: "所选接管人已停用，请选择其他成员。",
          SUCCESSOR_SAME_AS_TARGET: "接管人不能是被撤销成员本人。"
        };
        setError(
          messages[result?.code ?? ""] ??
            "权限撤销和工作交接失败，请刷新后重试。"
        );
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("网络连接异常，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        className={styles.dangerButton}
        type="button"
        onClick={() => {
          setConfirming(true);
          setSuccessorId("");
          setError(null);
        }}
      >
        撤销权限
      </button>
    );
  }

  return (
    <div className={styles.accessConfirmation}>
      <p>
        撤销 {props.memberName} 的权限后，客户和未完成任务会转给接管人。
      </p>
      <div className={styles.field}>
        <label htmlFor={`successor-${props.memberId}`}>
          工作接管人
        </label>
        <select
          className={styles.select}
          id={`successor-${props.memberId}`}
          value={successorId}
          disabled={submitting}
          onChange={(event) => {
            setSuccessorId(event.target.value);
            setError(null);
          }}
        >
          <option value="">请选择接管人</option>
          {props.successorOptions.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName} · {member.email} ·{" "}
              {roleLabel(member.role)}
            </option>
          ))}
        </select>
      </div>
      <p className={styles.secondaryText}>
        已完成和已取消任务只保留历史，不会更改负责人。
      </p>
      <div className={styles.inlineActions}>
        <button
          className={styles.dangerButton}
          type="button"
          disabled={submitting || !successorId}
          onClick={revoke}
        >
          {submitting ? "正在交接" : "确认撤销并交接"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={submitting}
          onClick={() => {
            setConfirming(false);
            setSuccessorId("");
            setError(null);
          }}
        >
          取消
        </button>
      </div>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
