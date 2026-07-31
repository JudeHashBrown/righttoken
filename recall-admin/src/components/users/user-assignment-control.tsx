"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

type OwnerOption = {
  id: string;
  displayName: string;
};

type UserAssignmentControlProps = {
  userId: string;
  currentCountryCode: string | null;
  currentRegion: string | null;
  members: OwnerOption[];
};

export function UserAssignmentControl({
  userId,
  currentCountryCode,
  currentRegion,
  members
}: UserAssignmentControlProps): React.JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [countryCode, setCountryCode] = useState("");
  const [region, setRegion] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setCountryCode("");
    setRegion("");
    setOwnerId("");
    setReason("");
    setError(null);
  }

  async function submit(): Promise<void> {
    const normalizedCountry = countryCode.trim().toUpperCase();
    const normalizedRegion = region.trim();
    const normalizedReason = reason.trim();
    if ((!normalizedCountry && !ownerId) || !normalizedReason) {
      return;
    }

    const body = {
      ...(normalizedCountry
        ? {
            countryCode: normalizedCountry,
            ...(normalizedRegion ? { region: normalizedRegion } : {})
          }
        : {}),
      ...(ownerId ? { ownerId } : {}),
      reason: normalizedReason
    };
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/users/${userId}/assignment`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        }
      );
      if (!response.ok) {
        throw new Error("ASSIGNMENT_FAILED");
      }
      setEditing(false);
      reset();
      router.refresh();
    } catch {
      setError("用户仍处于未分配状态，请重试");
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <button
        className={styles.textButton}
        onClick={() => setEditing(true)}
        type="button"
      >
        立即分配
      </button>
    );
  }

  return (
    <div className={styles.ownerControlEditor}>
      <p className={styles.ownerControlHint}>
        当前地区：
        {currentCountryCode
          ? `${currentCountryCode}${currentRegion ? ` · ${currentRegion}` : ""}`
          : "未识别"}
        。填写新地区会立即按客户分配规则匹配运营。
      </p>

      <label htmlFor={`assignment-country-${userId}`}>
        国家代码
      </label>
      <input
        className={styles.input}
        id={`assignment-country-${userId}`}
        maxLength={2}
        onChange={(event) => setCountryCode(event.target.value)}
        placeholder="例如 CN、US"
        value={countryCode}
      />

      <label htmlFor={`assignment-region-${userId}`}>
        省份或地区
      </label>
      <input
        className={styles.input}
        disabled={!countryCode.trim()}
        id={`assignment-region-${userId}`}
        maxLength={120}
        onChange={(event) => setRegion(event.target.value)}
        placeholder="例如 广东（可选）"
        value={region}
      />

      <label htmlFor={`assignment-owner-${userId}`}>
        指定运营人员
      </label>
      <select
        className={styles.select}
        id={`assignment-owner-${userId}`}
        onChange={(event) => setOwnerId(event.target.value)}
        value={ownerId}
      >
        <option value="">按地区规则自动匹配</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.displayName}
          </option>
        ))}
      </select>

      <label htmlFor={`assignment-reason-${userId}`}>
        分配原因
      </label>
      <textarea
        className={styles.textarea}
        id={`assignment-reason-${userId}`}
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
        placeholder="说明确认地区或指定运营的原因"
        rows={2}
        value={reason}
      />

      <div className={styles.inlineActions}>
        <button
          className={styles.button}
          disabled={
            pending ||
            (!countryCode.trim() && !ownerId) ||
            !reason.trim()
          }
          onClick={submit}
          type="button"
        >
          {pending ? "分配中…" : "确认分配"}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={pending}
          onClick={() => {
            setEditing(false);
            reset();
          }}
          type="button"
        >
          取消
        </button>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
