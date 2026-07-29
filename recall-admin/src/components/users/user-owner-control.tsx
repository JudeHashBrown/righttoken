"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OwnerAssignmentMode } from "@/generated/prisma/client";
import styles from "@/components/workspaces/workspace.module.css";
import { ownerAssignmentLabel } from "@/modules/users/presentation";

type OwnerOption = {
  id: string;
  displayName: string;
};

type UserOwnerControlProps = {
  userId: string;
  currentOwnerId: string | null;
  currentOwnerName: string;
  assignmentMode: OwnerAssignmentMode;
  members: OwnerOption[];
  compact?: boolean;
};

export function UserOwnerControl({
  userId,
  currentOwnerId,
  currentOwnerName,
  assignmentMode,
  members,
  compact = false
}: UserOwnerControlProps): React.JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingRestore, setConfirmingRestore] =
    useState(false);
  const [ownerId, setOwnerId] = useState(currentOwnerId ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<
    "assign" | "restore" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function assign(): Promise<void> {
    const normalizedReason = reason.trim();
    if (!ownerId || !normalizedReason) return;
    setPending("assign");
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/owner`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerId,
          reason: normalizedReason
        })
      });
      if (!response.ok) {
        throw new Error("OWNER_CHANGE_FAILED");
      }
      setEditing(false);
      setReason("");
      router.refresh();
    } catch {
      setError("负责人没有调整，请刷新后重试");
    } finally {
      setPending(null);
    }
  }

  async function restore(): Promise<void> {
    setPending("restore");
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/owner`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("OWNER_RESTORE_FAILED");
      }
      setConfirmingRestore(false);
      router.refresh();
    } catch {
      setError("暂时无法恢复自动分配，请刷新后重试");
    } finally {
      setPending(null);
    }
  }

  return (
    <div
      className={`${styles.ownerControl} ${
        compact ? styles.ownerControlCompact : ""
      }`}
    >
      <div className={styles.ownerControlSummary}>
        {!compact ? <strong>{currentOwnerName}</strong> : null}
        <span className={styles.status}>
          {ownerAssignmentLabel(assignmentMode)}
        </span>
      </div>

      {!editing && !confirmingRestore ? (
        <div className={styles.inlineActions}>
          <button
            className={styles.textButton}
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
            type="button"
          >
            调整负责人
          </button>
          {assignmentMode === "MANUAL" ? (
            <button
              className={styles.textButton}
              onClick={() => {
                setConfirmingRestore(true);
                setError(null);
              }}
              type="button"
            >
              恢复自动分配
            </button>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className={styles.ownerControlEditor}>
          <label htmlFor={`owner-${userId}`}>新负责人</label>
          <select
            className={styles.select}
            id={`owner-${userId}`}
            onChange={(event) => setOwnerId(event.target.value)}
            value={ownerId}
          >
            <option value="">请选择负责人</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
          <label htmlFor={`owner-reason-${userId}`}>调整原因</label>
          <textarea
            className={styles.textarea}
            id={`owner-reason-${userId}`}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="说明为什么需要调整负责人"
            rows={2}
            value={reason}
          />
          <p className={styles.ownerControlHint}>
            人工调整后，系统不会自动覆盖该负责人。
          </p>
          <div className={styles.inlineActions}>
            <button
              className={styles.button}
              disabled={
                pending !== null || !ownerId || !reason.trim()
              }
              onClick={assign}
              type="button"
            >
              {pending === "assign" ? "调整中…" : "确认调整"}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={pending !== null}
              onClick={() => {
                setEditing(false);
                setReason("");
                setOwnerId(currentOwnerId ?? "");
              }}
              type="button"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {confirmingRestore ? (
        <div className={styles.accessConfirmation}>
          <p>恢复后，系统会立即按照当前地区规则重新分配负责人。</p>
          <div className={styles.inlineActions}>
            <button
              className={styles.button}
              disabled={pending !== null}
              onClick={restore}
              type="button"
            >
              {pending === "restore" ? "恢复中…" : "确认恢复"}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={pending !== null}
              onClick={() => setConfirmingRestore(false)}
              type="button"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
