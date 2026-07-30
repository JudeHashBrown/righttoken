"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";
import {
  mergeMemberTerritories,
  type MemberTerritory
} from "@/modules/assignment/member-territories";
import type { AssignmentRuleInput } from "@/modules/assignment/types";

type EditableTerritory = {
  countryCode: string;
  regions: string;
};

type PreviewResult = {
  sampledUsers: number;
  publicPool: number;
  unmatchedConditions: number;
};

function editable(
  territories: MemberTerritory[]
): EditableTerritory[] {
  return territories.length
    ? territories.map((territory) => ({
        countryCode: territory.countryCode,
        regions: territory.regions.join("、")
      }))
    : [{ countryCode: "", regions: "" }];
}

function requestTerritories(
  territories: EditableTerritory[]
): MemberTerritory[] {
  return territories
    .map((territory) => ({
      countryCode: territory.countryCode.trim().toUpperCase(),
      regions: territory.regions
        .split(/[、,，]/u)
        .map((region) => region.trim())
        .filter(Boolean)
    }))
    .filter((territory) => territory.countryCode);
}

export function MemberTerritoryEditor({
  member,
  initialTerritories,
  allRules
}: {
  member: { id: string; displayName: string };
  initialTerritories: MemberTerritory[];
  allRules: AssignmentRuleInput[];
}): React.JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [territories, setTerritories] = useState(() =>
    editable(initialTerritories)
  );
  const [preview, setPreview] = useState<PreviewResult | null>(
    null
  );
  const [pending, setPending] = useState<
    "preview" | "save" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);

  const current = requestTerritories(territories);
  const valid =
    current.length > 0 &&
    current.every((territory) =>
      /^[A-Z]{2}$/.test(territory.countryCode)
    );

  function update(
    index: number,
    patch: Partial<EditableTerritory>
  ): void {
    setTerritories((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
    setPreview(null);
    setMessage(null);
  }

  function mergedRules(): AssignmentRuleInput[] {
    return mergeMemberTerritories(
      member.id,
      requestTerritories(territories),
      allRules
    );
  }

  async function submit(mode: "preview" | "save"): Promise<void> {
    if (!valid) return;
    setPending(mode);
    setMessage(null);
    try {
      const response = await fetch(
        mode === "preview"
          ? "/api/automation/assignment-rules/preview"
          : "/api/automation/assignment-rules",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rules: mergedRules() })
        }
      );
      const body = (await response.json().catch(() => ({}))) as
        | PreviewResult
        | { published?: number };
      if (!response.ok) {
        throw new Error("TERRITORY_SAVE_FAILED");
      }
      if (mode === "preview") {
        setPreview(body as PreviewResult);
      } else {
        setMessage("负责地区已保存，系统正在重新分配用户");
        setEditing(false);
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error &&
          error.message === "TERRITORY_CONFLICT"
          ? "该地区已经由其他运营人员负责"
          : "负责地区没有保存，请检查后重试"
      );
    } finally {
      setPending(null);
    }
  }

  if (!editing) {
    return (
      <div className={styles.territorySummary}>
        {initialTerritories.length ? (
          initialTerritories.map((territory) => (
            <span className={styles.status} key={territory.countryCode}>
              {territory.countryCode}
              {territory.regions.length
                ? ` · ${territory.regions.join("、")}`
                : ""}
            </span>
          ))
        ) : (
          <span className={styles.secondaryText}>尚未设置</span>
        )}
        <button
          className={styles.textButton}
          onClick={() => {
            setEditing(true);
            setMessage(null);
          }}
          type="button"
        >
          设置负责地区
        </button>
        {message ? (
          <span className={styles.success}>{message}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.territoryEditor}>
      <strong>{member.displayName}负责的地区</strong>
      {territories.map((territory, index) => (
        <div
          className={styles.territoryEditorRow}
          key={`territory-${index}`}
        >
          <div className={styles.field}>
            <label htmlFor={`territory-country-${member.id}-${index}`}>
              国家或地区
            </label>
            <input
              className={styles.input}
              id={`territory-country-${member.id}-${index}`}
              maxLength={2}
              onChange={(event) =>
                update(index, {
                  countryCode: event.target.value
                })
              }
              placeholder="例如 CN"
              value={territory.countryCode}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={`territory-regions-${member.id}-${index}`}>
              省 / 州 / 地区
            </label>
            <input
              className={styles.input}
              id={`territory-regions-${member.id}-${index}`}
              onChange={(event) =>
                update(index, { regions: event.target.value })
              }
              placeholder="广东、广西；留空表示整个国家"
              value={territory.regions}
            />
          </div>
          <button
            aria-label={`删除地区 ${index + 1}`}
            className={styles.dangerButton}
            disabled={territories.length === 1}
            onClick={() =>
              setTerritories((items) =>
                items.filter(
                  (_, itemIndex) => itemIndex !== index
                )
              )
            }
            type="button"
          >
            删除
          </button>
        </div>
      ))}
      <button
        className={styles.textButton}
        onClick={() =>
          setTerritories((items) => [
            ...items,
            { countryCode: "", regions: "" }
          ])
        }
        type="button"
      >
        添加国家或地区
      </button>
      {preview ? (
        <p className={styles.previewResult}>
          预计查看 {preview.sampledUsers} 位用户
        </p>
      ) : null}
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      <div className={styles.inlineActions}>
        <button
          className={styles.secondaryButton}
          disabled={!valid || pending !== null}
          onClick={() => submit("preview")}
          type="button"
        >
          {pending === "preview" ? "预览中…" : "预览影响"}
        </button>
        <button
          className={styles.button}
          disabled={!valid || pending !== null}
          onClick={() => submit("save")}
          type="button"
        >
          {pending === "save" ? "保存中…" : "保存负责地区"}
        </button>
        <button
          className={styles.secondaryButton}
          disabled={pending !== null}
          onClick={() => {
            setEditing(false);
            setTerritories(editable(initialTerritories));
            setPreview(null);
            setMessage(null);
          }}
          type="button"
        >
          取消
        </button>
      </div>
    </div>
  );
}
