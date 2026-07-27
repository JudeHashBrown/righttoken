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
};

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canRevoke(props)) {
    return null;
  }

  async function revoke(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/members/${props.memberId}/access`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        setError("权限撤销失败，请刷新后重试。");
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
        onClick={() => setConfirming(true)}
      >
        撤销权限
      </button>
    );
  }

  return (
    <div className={styles.accessConfirmation}>
      <p>
        撤销后，该成员将立即退出，负责用户和未完成任务会重新分配。
      </p>
      <div className={styles.inlineActions}>
        <button
          className={styles.dangerButton}
          type="button"
          disabled={submitting}
          onClick={revoke}
        >
          {submitting ? "正在撤销" : "确认撤销"}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={submitting}
          onClick={() => setConfirming(false)}
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
