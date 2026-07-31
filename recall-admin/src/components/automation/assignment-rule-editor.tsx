"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole, SegmentCode } from "@/generated/prisma/client";
import styles from "@/components/workspaces/workspace.module.css";

const segmentValues: SegmentCode[] = ["A", "B", "C", "D", "E", "F", "G"];

export type EditableAssignmentRule = {
  id?: string;
  name: string;
  enabled: boolean;
  memberTerritoryManaged?: boolean;
  priority: number;
  countryCodes: string;
  regions?: string;
  sources: string;
  segments: SegmentCode[];
  assigneeId: string;
  fallbackAssigneeId: string;
  poolKey: string;
  workloadLimit: string;
};

type AssignmentMemberOption = {
  id: string;
  displayName: string;
  role: MemberRole;
  openTasks: number;
};

type PreviewResult = {
  sampledUsers: number;
  publicPool: number;
  unmatchedConditions: number;
};

function emptyRule(priority: number): EditableAssignmentRule {
  return {
    name: "",
    enabled: true,
    memberTerritoryManaged: false,
    priority,
    countryCodes: "",
    regions: "",
    sources: "",
    segments: [],
    assigneeId: "",
    fallbackAssigneeId: "",
    poolKey: "",
    workloadLimit: ""
  };
}

function list(value: string): string[] | undefined {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function requestRules(rules: EditableAssignmentRule[]) {
  return rules.map((rule, index) => ({
    ...(rule.id ? { id: rule.id } : {}),
    name: rule.name.trim(),
    enabled: rule.enabled,
    memberTerritoryManaged:
      rule.memberTerritoryManaged ?? false,
    priority: index + 1,
    conditions: {
      ...(list(rule.countryCodes)
        ? {
            countryCodes: list(rule.countryCodes)?.map((code) =>
              code.toUpperCase()
            )
          }
        : {}),
      ...(list(rule.regions ?? "")
        ? { regionIncludes: list(rule.regions ?? "") }
        : {}),
      ...(list(rule.sources) ? { sources: list(rule.sources) } : {}),
      ...(rule.segments.length ? { segments: rule.segments } : {})
    },
    assigneeId: rule.assigneeId || null,
    fallbackAssigneeId: rule.fallbackAssigneeId || null,
    poolKey: rule.poolKey.trim() || null,
    workloadLimit: rule.workloadLimit
      ? Number(rule.workloadLimit)
      : null,
    effectiveFrom: null,
    effectiveTo: null
  }));
}

export function AssignmentRuleEditor({
  initialRules,
  members
}: {
  initialRules: EditableAssignmentRule[];
  members: AssignmentMemberOption[];
}): React.JSX.Element {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [pending, setPending] = useState<"preview" | "publish" | null>(
    null
  );
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const valid = useMemo(
    () =>
      rules.length > 0 &&
      rules.every(
        (rule) =>
          rule.name.trim() &&
          (!rule.workloadLimit || Number(rule.workloadLimit) > 0)
      ),
    [rules]
  );

  function update(
    index: number,
    patch: Partial<EditableAssignmentRule>
  ): void {
    setRules((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule
      )
    );
    setPreview(null);
    setMessage(null);
  }

  function move(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= rules.length) return;
    setRules((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setPreview(null);
  }

  async function submit(
    mode: "preview" | "publish"
  ): Promise<void> {
    if (!valid) return;
    setPending(mode);
    setMessage(null);
    try {
      const path =
        mode === "preview"
          ? "/api/automation/assignment-rules/preview"
          : "/api/automation/assignment-rules";
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules: requestRules(rules) })
      });
      const body = (await response.json().catch(() => ({}))) as
        | PreviewResult
        | { published?: number };
      if (!response.ok) {
        throw new Error("分配方案未能保存，请检查条件和负责人");
      }
      if (mode === "preview") {
        setPreview(body as PreviewResult);
      } else {
        setMessage(
          `已保存 ${(body as { published?: number }).published ?? rules.length} 条分配条件`
        );
        router.refresh();
      }
    } catch {
      setMessage("暂时无法完成操作，请稍后重试");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editorToolbar}>
        <button
          className={styles.secondaryButton}
          onClick={() =>
            setRules((current) => [
              ...current,
              emptyRule(current.length + 1)
            ])
          }
          type="button"
        >
          新增分配条件
        </button>
        <div className={styles.inlineActions}>
          <button
            className={styles.secondaryButton}
            disabled={!valid || pending !== null}
            onClick={() => submit("preview")}
            type="button"
          >
            {pending === "preview" ? "预览中…" : "预览分配"}
          </button>
          <button
            className={styles.button}
            disabled={!valid || pending !== null}
            onClick={() => submit("publish")}
            type="button"
          >
            {pending === "publish" ? "保存中…" : "保存分配方案"}
          </button>
        </div>
      </div>

      {rules.length ? (
        <div className={styles.ruleList}>
          {rules.map((rule, index) => (
            <section
              className={styles.ruleCard}
              key={rule.id ?? `draft-${index}`}
            >
              <div className={styles.ruleCardHeader}>
                <strong>判断顺序 {index + 1}</strong>
                <div className={styles.inlineActions}>
                  <button
                    aria-label={`上移分配条件 ${index + 1}`}
                    className={styles.secondaryButton}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`下移分配条件 ${index + 1}`}
                    className={styles.secondaryButton}
                    disabled={index === rules.length - 1}
                    onClick={() => move(index, 1)}
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    className={styles.dangerButton}
                    onClick={() =>
                      setRules((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className={styles.editorGrid}>
                <div className={styles.field}>
                  <label htmlFor={`rule-name-${index}`}>条件名称</label>
                  <input
                    aria-label="分配条件名称"
                    className={styles.input}
                    id={`rule-name-${index}`}
                    maxLength={120}
                    onChange={(event) =>
                      update(index, { name: event.target.value })
                    }
                    value={rule.name}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`rule-countries-${index}`}>
                    国家或地区
                  </label>
                  <input
                    className={styles.input}
                    id={`rule-countries-${index}`}
                    onChange={(event) =>
                      update(index, {
                        countryCodes: event.target.value
                      })
                    }
                    placeholder="例如 CN、US、SG"
                    value={rule.countryCodes}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`rule-regions-${index}`}>省 / 州 / 地区</label>
                  <input
                    className={styles.input}
                    id={`rule-regions-${index}`}
                    onChange={(event) =>
                      update(index, { regions: event.target.value })
                    }
                    placeholder="广东省、California、东京"
                    value={rule.regions ?? ""}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`rule-sources-${index}`}>注册渠道（选填）</label>
                  <input
                    className={styles.input}
                    id={`rule-sources-${index}`}
                    onChange={(event) =>
                      update(index, { sources: event.target.value })
                    }
                    placeholder="填写主站中记录的渠道名称"
                    value={rule.sources}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`rule-assignee-${index}`}>
                    主要负责人
                  </label>
                  <select
                    className={styles.select}
                    id={`rule-assignee-${index}`}
                    onChange={(event) =>
                      update(index, {
                        assigneeId: event.target.value
                      })
                    }
                    value={rule.assigneeId}
                  >
                    <option value="">公共任务池</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName} · {member.openTasks} 项
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor={`rule-fallback-${index}`}>
                    后备负责人
                  </label>
                  <select
                    className={styles.select}
                    id={`rule-fallback-${index}`}
                    onChange={(event) =>
                      update(index, {
                        fallbackAssigneeId: event.target.value
                      })
                    }
                    value={rule.fallbackAssigneeId}
                  >
                    <option value="">公共任务池</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor={`rule-limit-${index}`}>最多同时负责</label>
                  <input
                    className={styles.input}
                    id={`rule-limit-${index}`}
                    min={1}
                    onChange={(event) =>
                      update(index, {
                        workloadLimit: event.target.value
                      })
                    }
                    placeholder="不限"
                    type="number"
                    value={rule.workloadLimit}
                  />
                </div>
              </div>

              <fieldset className={styles.segmentPicker}>
                <legend>适用分组</legend>
                {segmentValues.map((segment) => (
                  <label key={segment}>
                    <input
                      checked={rule.segments.includes(segment)}
                      onChange={(event) =>
                        update(index, {
                          segments: event.target.checked
                            ? [...rule.segments, segment]
                            : rule.segments.filter(
                                (value) => value !== segment
                              )
                        })
                      }
                      type="checkbox"
                    />
                    {segment}
                  </label>
                ))}
              </fieldset>

              <label className={styles.toggle}>
                <input
                  checked={rule.enabled}
                  onChange={(event) =>
                    update(index, { enabled: event.target.checked })
                  }
                  type="checkbox"
                />
                使用这项分配条件
              </label>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>尚未设置负责人分配条件</strong>
          <p>新增第一项条件；暂时无法匹配的用户将保持未分配。</p>
        </div>
      )}

      {preview ? (
        <div className={styles.previewResult} role="status">
          <strong>已查看最近 {preview.sampledUsers} 位用户</strong>
          <span>待分配用户 {preview.publicPool} 人</span>
          <span>暂未找到负责人 {preview.unmatchedConditions} 人</span>
        </div>
      ) : null}
      {message ? (
        <p
          className={
            message.startsWith("已保存")
              ? styles.success
              : styles.error
          }
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
