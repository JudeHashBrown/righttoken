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
  priority: number;
  countryCodes: string;
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
    priority,
    countryCodes: "",
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
    priority: index + 1,
    conditions: {
      ...(list(rule.countryCodes)
        ? {
            countryCodes: list(rule.countryCodes)?.map((code) =>
              code.toUpperCase()
            )
          }
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
        throw new Error("规则校验失败，请检查条件和负责人");
      }
      if (mode === "preview") {
        setPreview(body as PreviewResult);
      } else {
        setMessage(
          `已发布 ${(body as { published?: number }).published ?? rules.length} 条规则`
        );
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "操作失败，请稍后重试"
      );
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
          新增规则
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
            {pending === "publish" ? "发布中…" : "发布规则"}
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
                <strong>优先级 {index + 1}</strong>
                <div className={styles.inlineActions}>
                  <button
                    aria-label={`上移规则 ${index + 1}`}
                    className={styles.secondaryButton}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`下移规则 ${index + 1}`}
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
                  <label htmlFor={`rule-name-${index}`}>规则名称</label>
                  <input
                    aria-label="规则名称"
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
                    国家代码
                  </label>
                  <input
                    className={styles.input}
                    id={`rule-countries-${index}`}
                    onChange={(event) =>
                      update(index, {
                        countryCodes: event.target.value
                      })
                    }
                    placeholder="SG, US, DE"
                    value={rule.countryCodes}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor={`rule-sources-${index}`}>注册来源</label>
                  <input
                    className={styles.input}
                    id={`rule-sources-${index}`}
                    onChange={(event) =>
                      update(index, { sources: event.target.value })
                    }
                    placeholder="organic, partner"
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
                  <label htmlFor={`rule-limit-${index}`}>负载上限</label>
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
                启用此规则
              </label>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>尚未配置分配规则</strong>
          <p>新增第一条规则，或继续让所有任务进入公共任务池。</p>
        </div>
      )}

      {preview ? (
        <div className={styles.previewResult} role="status">
          <strong>抽样 {preview.sampledUsers} 位用户</strong>
          <span>公共池 {preview.publicPool} 人</span>
          <span>未匹配 {preview.unmatchedConditions} 人</span>
        </div>
      ) : null}
      {message ? (
        <p
          className={
            message.startsWith("已发布")
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
