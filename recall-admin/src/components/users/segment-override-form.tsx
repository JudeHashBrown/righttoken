"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { SegmentCode } from "@/generated/prisma/client";
import styles from "@/components/workspaces/workspace.module.css";

export function SegmentOverrideForm({
  userId,
  anomalyActive
}: {
  userId: string;
  anomalyActive: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const [segment, setSegment] = useState<SegmentCode>("A");
  const [reason, setReason] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const expiresAt = new Date(
        Date.now() + durationDays * 24 * 60 * 60 * 1_000
      ).toISOString();
      const response = await fetch(
        `/api/users/${userId}/segment-override`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ segment, reason, expiresAt })
        }
      );
      if (!response.ok) {
        throw new Error("临时分组保存失败，请检查原因和有效期");
      }
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "临时分组保存失败"
      );
    } finally {
      setPending(false);
    }
  }

  if (anomalyActive) {
    return (
      <div className={styles.formBody}>
        <p className={styles.error}>
          当前用户处于 F 服务异常处理期。为避免掩盖故障，处理期内不能人工覆盖分组（最长 24 小时）。
        </p>
      </div>
    );
  }

  return (
    <form className={styles.formBody} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="override-segment">临时分组</label>
        <select
          className={styles.select}
          id="override-segment"
          onChange={(event) =>
            setSegment(event.target.value as SegmentCode)
          }
          value={segment}
        >
          {(["A", "B", "C", "D", "E", "F", "G"] as const).map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            )
          )}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="override-duration">有效期</label>
        <select
          className={styles.select}
          id="override-duration"
          onChange={(event) =>
            setDurationDays(Number(event.target.value))
          }
          value={durationDays}
        >
          <option value={1}>1 天</option>
          <option value={3}>3 天</option>
          <option value={7}>7 天</option>
          <option value={14}>14 天</option>
          <option value={30}>30 天</option>
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="override-reason">调整原因</label>
        <textarea
          className={styles.textarea}
          id="override-reason"
          maxLength={500}
          minLength={3}
          onChange={(event) => setReason(event.target.value)}
          placeholder="填写人工判断依据，便于后续审计"
          required
          value={reason}
        />
      </div>
      <button
        className={styles.button}
        disabled={pending || reason.trim().length < 3}
        type="submit"
      >
        {pending ? "发布中…" : "发布临时分组"}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
