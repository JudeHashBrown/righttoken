"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LocationAssignmentMode } from "@/generated/prisma/client";
import styles from "@/components/workspaces/workspace.module.css";
import { operationalCountryOptions } from "@/modules/location/country-options";

type UserLocationControlProps = {
  userId: string;
  currentCountryCode: string | null;
  currentRegion: string | null;
  assignmentMode: LocationAssignmentMode;
};

export function UserLocationControl({
  userId,
  currentCountryCode,
  currentRegion,
  assignmentMode
}: UserLocationControlProps): React.JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingRestore, setConfirmingRestore] =
    useState(false);
  const [countryCode, setCountryCode] = useState(
    currentCountryCode ?? ""
  );
  const [region, setRegion] = useState(currentRegion ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<
    "confirm" | "restore" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmLocation(): Promise<void> {
    const normalizedReason = reason.trim();
    if (!countryCode || !normalizedReason) return;
    setPending("confirm");
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/location`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          countryCode,
          region: region.trim(),
          reason: normalizedReason
        })
      });
      if (!response.ok) {
        throw new Error("LOCATION_CHANGE_FAILED");
      }
      setEditing(false);
      setReason("");
      router.refresh();
    } catch {
      setError("所属地区没有更新，请稍后重试");
    } finally {
      setPending(null);
    }
  }

  async function restore(): Promise<void> {
    setPending("restore");
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/location`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("LOCATION_RESTORE_FAILED");
      }
      setConfirmingRestore(false);
      router.refresh();
    } catch {
      setError("暂时无法恢复自动判定，请刷新后重试");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.ownerControl}>
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
            确认所属地区
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
              恢复自动判定
            </button>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className={styles.ownerControlEditor}>
          <label htmlFor={`location-country-${userId}`}>
            国家或地区
          </label>
          <select
            className={styles.select}
            id={`location-country-${userId}`}
            onChange={(event) => setCountryCode(event.target.value)}
            value={countryCode}
          >
            <option value="">请选择国家或地区</option>
            {operationalCountryOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}（{option.code}）
              </option>
            ))}
          </select>
          <label htmlFor={`location-region-${userId}`}>
            省 / 州 / 地区
          </label>
          <input
            className={styles.input}
            id={`location-region-${userId}`}
            maxLength={120}
            onChange={(event) => setRegion(event.target.value)}
            placeholder="可选，例如广东、California"
            value={region}
          />
          <label htmlFor={`location-reason-${userId}`}>
            确认原因
          </label>
          <textarea
            className={styles.textarea}
            id={`location-reason-${userId}`}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="说明地区信息的确认依据"
            rows={2}
            value={reason}
          />
          <p className={styles.ownerControlHint}>
            人工确认后，邮箱、注册 IP 和主站同步不会覆盖该地区。
            系统负责人会按新地区重新匹配，人工负责人保持不变。
          </p>
          <div className={styles.inlineActions}>
            <button
              className={styles.button}
              disabled={
                pending !== null || !countryCode || !reason.trim()
              }
              onClick={confirmLocation}
              type="button"
            >
              {pending === "confirm" ? "确认中…" : "确认地区"}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={pending !== null}
              onClick={() => {
                setEditing(false);
                setCountryCode(currentCountryCode ?? "");
                setRegion(currentRegion ?? "");
                setReason("");
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
          <p>
            恢复后，系统会根据当前邮箱、注册 IP
            和主站信息重新判定地区。人工负责人不会因此改变。
          </p>
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
