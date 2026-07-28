"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MemberRole,
  TaskStatus
} from "@/generated/prisma/client";
import styles from "@/components/workspaces/workspace.module.css";
import {
  mailComposeHref
} from "@/modules/mail/compose-link";

type ActionKey =
  | "claim"
  | "start"
  | "wait_user"
  | "complete"
  | "pause"
  | "resume";

type TaskActionsProps = {
  task: {
    id: string;
    userId: string;
    status: TaskStatus;
    assigneeId: string | null;
  };
  viewer: {
    id: string;
    role: MemberRole;
  };
  operators: Array<{
    id: string;
    displayName: string;
  }>;
};

const actionsByStatus: Partial<
  Record<TaskStatus, Array<{ action: ActionKey; label: string }>>
> = {
  UNASSIGNED: [{ action: "claim", label: "领取任务" }],
  TODO: [
    { action: "start", label: "开始处理" },
    { action: "pause", label: "暂停" }
  ],
  IN_PROGRESS: [
    { action: "wait_user", label: "等待用户" },
    { action: "complete", label: "完成任务" },
    { action: "pause", label: "暂停" }
  ],
  WAITING_USER: [
    { action: "start", label: "继续处理" },
    { action: "complete", label: "完成任务" },
    { action: "pause", label: "暂停" }
  ],
  PAUSED: [{ action: "resume", label: "恢复任务" }]
};

export function TaskActions({
  task,
  viewer,
  operators
}: TaskActionsProps): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [targetAssigneeId, setTargetAssigneeId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const isOperator = viewer.role === "OPERATOR";
  const isMine = task.assigneeId === viewer.id;
  const isPublic =
    task.assigneeId === null && task.status === "UNASSIGNED";
  const canWork = !isOperator || isMine || isPublic;
  const availableActions = canWork
    ? actionsByStatus[task.status] ?? []
    : [];
  const canCancel =
    task.status !== "COMPLETED" &&
    task.status !== "CANCELLED" &&
    (!isOperator || isMine);
  const canTransfer =
    task.assigneeId !== null &&
    task.status !== "COMPLETED" &&
    task.status !== "CANCELLED" &&
    (!isOperator || isMine);

  async function mutate(
    path: string,
    body: Record<string, string>
  ): Promise<void> {
    setPending(path);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error("操作未完成，请刷新后重试");
      }
      setShowCancel(false);
      setCancelReason("");
      setTransferReason("");
      setTargetAssigneeId("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "操作未完成"
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.actionPanel}>
      <div className={styles.actionRow}>
        {canWork &&
        (task.status === "IN_PROGRESS" ||
          task.status === "WAITING_USER") ? (
          <Link
            className={
              task.status === "IN_PROGRESS"
                ? styles.button
                : styles.secondaryButton
            }
            href={mailComposeHref({
              userId: task.userId,
              taskId: task.id
            })}
          >
            {task.status === "IN_PROGRESS"
              ? "联系用户"
              : "再次联系"}
          </Link>
        ) : null}
        {availableActions.map(({ action, label }) => (
          <button
            className={
              action === "complete"
                ? styles.button
                : styles.secondaryButton
            }
            disabled={pending !== null}
            key={action}
            onClick={() =>
              mutate(`/api/tasks/${task.id}/transition`, { action })
            }
            type="button"
          >
            {pending ? "处理中…" : label}
          </button>
        ))}
        {canCancel ? (
          <button
            className={styles.dangerButton}
            disabled={pending !== null}
            onClick={() => setShowCancel((value) => !value)}
            type="button"
          >
            取消任务
          </button>
        ) : null}
      </div>

      {showCancel ? (
        <div className={styles.field}>
          <label htmlFor="cancel-reason">取消原因</label>
          <textarea
            className={styles.textarea}
            id="cancel-reason"
            maxLength={500}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="说明为什么取消这项任务"
            value={cancelReason}
          />
          <button
            className={styles.dangerButton}
            disabled={!cancelReason.trim() || pending !== null}
            onClick={() =>
              mutate(`/api/tasks/${task.id}/transition`, {
                action: "cancel",
                reason: cancelReason
              })
            }
            type="button"
          >
            确认取消
          </button>
        </div>
      ) : null}

      {canTransfer && operators.length > 0 ? (
        <div className={styles.field}>
          <label htmlFor="transfer-assignee">转派任务</label>
          <select
            className={styles.select}
            id="transfer-assignee"
            onChange={(event) =>
              setTargetAssigneeId(event.target.value)
            }
            value={targetAssigneeId}
          >
            <option value="">选择新负责人</option>
            {operators
              .filter((operator) => operator.id !== task.assigneeId)
              .map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.displayName}
                </option>
              ))}
          </select>
          <input
            className={styles.input}
            maxLength={500}
            onChange={(event) =>
              setTransferReason(event.target.value)
            }
            placeholder="填写转派原因"
            value={transferReason}
          />
          <button
            className={styles.secondaryButton}
            disabled={
              !targetAssigneeId ||
              !transferReason.trim() ||
              pending !== null
            }
            onClick={() =>
              mutate(`/api/tasks/${task.id}/transfer`, {
                assigneeId: targetAssigneeId,
                reason: transferReason
              })
            }
            type="button"
          >
            确认转派
          </button>
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
