"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LocationRuleMatchType } from "@/modules/location/email-domain";
import styles from "@/components/workspaces/workspace.module.css";

export type EditableLocationRule = {
  id?: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchType: LocationRuleMatchType;
  pattern: string;
  countryCode: string;
};

type PreviewResult = {
  totalUsers: number;
  changedUsers: number;
  countsByCountry: Record<string, number>;
};

function emptyRule(priority: number): EditableLocationRule {
  return {
    name: "新邮箱规则",
    enabled: true,
    priority,
    matchType: "EXACT_DOMAIN",
    pattern: "",
    countryCode: ""
  };
}

function requestRules(rules: EditableLocationRule[]) {
  return rules.map((rule, index) => ({
    ...(rule.id ? { id: rule.id } : {}),
    name: rule.name.trim(),
    enabled: rule.enabled,
    priority: index + 1,
    matchType: rule.matchType,
    pattern: rule.pattern.trim(),
    countryCode: rule.countryCode.trim().toUpperCase()
  }));
}

export function LocationRuleEditor({
  initialRules,
  editable
}: {
  initialRules: EditableLocationRule[];
  editable: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [pending, setPending] = useState<
    "preview" | "publish" | null
  >(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const valid = useMemo(
    () =>
      rules.length > 0 &&
      rules.every(
        (rule) =>
          rule.name.trim() &&
          rule.pattern.trim() &&
          /^[a-z]{2}$/i.test(rule.countryCode.trim())
      ),
    [rules]
  );

  function update(
    index: number,
    patch: Partial<EditableLocationRule>
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
    if (!editable || !valid) return;
    setPending(mode);
    setMessage(null);
    try {
      const response = await fetch(
        mode === "preview"
          ? "/api/automation/location-rules/preview"
          : "/api/automation/location-rules",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rules: requestRules(rules) })
        }
      );
      const body = (await response.json().catch(() => ({}))) as
        | PreviewResult
        | { published?: number };
      if (!response.ok) {
        throw new Error("规则校验失败，请检查域名和国家代码");
      }
      if (mode === "preview") {
        setPreview(body as PreviewResult);
      } else {
        setMessage(
          `已发布 ${(body as { published?: number }).published ?? rules.length} 条归属规则`
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
      {editable ? (
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
            新增邮箱规则
          </button>
          <div className={styles.inlineActions}>
            <button
              className={styles.secondaryButton}
              disabled={!valid || pending !== null}
              onClick={() => submit("preview")}
              type="button"
            >
              {pending === "preview" ? "计算中…" : "预览影响"}
            </button>
            <button
              className={styles.button}
              disabled={!valid || pending !== null}
              onClick={() => submit("publish")}
              type="button"
            >
              {pending === "publish" ? "发布中…" : "发布归属规则"}
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.locationRuleTableWrap}>
        <table className={styles.locationRuleTable}>
          <thead>
            <tr>
              <th>规则名称</th>
              <th>匹配方式</th>
              <th>邮箱域名</th>
              <th>国家</th>
              <th>状态与顺序</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, index) => (
              <tr key={rule.id ?? `location-draft-${index}`}>
                <td>
                  <input
                    aria-label="归属规则名称"
                    className={styles.input}
                    disabled={!editable}
                    id={`location-name-${index}`}
                    onChange={(event) =>
                      update(index, { name: event.target.value })
                    }
                    value={rule.name}
                  />
                </td>
                <td>
                  <select
                    aria-label="匹配方式"
                    className={styles.select}
                    disabled={!editable}
                    id={`location-type-${index}`}
                    onChange={(event) =>
                      update(index, {
                        matchType: event.target
                          .value as LocationRuleMatchType
                      })
                    }
                    value={rule.matchType}
                  >
                    <option value="EXACT_DOMAIN">完整邮箱域名</option>
                    <option value="DOMAIN_SUFFIX">国家域名后缀</option>
                  </select>
                </td>
                <td>
                  <input
                    aria-label="匹配内容"
                    className={styles.input}
                    disabled={!editable}
                    id={`location-pattern-${index}`}
                    onChange={(event) =>
                      update(index, { pattern: event.target.value })
                    }
                    placeholder={
                      rule.matchType === "EXACT_DOMAIN"
                        ? "qq.com"
                        : ".ru"
                    }
                    value={rule.pattern}
                  />
                </td>
                <td>
                  <input
                    aria-label="归属国家"
                    className={styles.input}
                    disabled={!editable}
                    id={`location-country-${index}`}
                    maxLength={2}
                    onChange={(event) =>
                      update(index, {
                        countryCode: event.target.value.toUpperCase()
                      })
                    }
                    placeholder="CN"
                    value={rule.countryCode}
                  />
                </td>
                <td>
                  <div className={styles.locationRuleActions}>
                    <label className={styles.compactToggle}>
                      <input
                        checked={rule.enabled}
                        disabled={!editable}
                        onChange={(event) =>
                          update(index, {
                            enabled: event.target.checked
                          })
                        }
                        type="checkbox"
                      />{" "}
                      启用
                    </label>
                    {editable ? (
                      <>
                        <button
                          aria-label={`上移归属规则 ${index + 1}`}
                          className={styles.compactIconButton}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`下移归属规则 ${index + 1}`}
                          className={styles.compactIconButton}
                          disabled={index === rules.length - 1}
                          onClick={() => move(index, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                        <button
                          aria-label={`删除归属规则 ${index + 1}`}
                          className={styles.compactDeleteButton}
                          onClick={() =>
                            setRules((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index
                              )
                            )
                          }
                          type="button"
                        >
                          删除
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview ? (
        <div className={styles.notice}>
          <span>{`预计调整 ${preview.changedUsers} 位用户`}</span>
          <span>{`（共 ${preview.totalUsers} 位）`}</span>
        </div>
      ) : null}
      {message ? <div className={styles.notice}>{message}</div> : null}
    </div>
  );
}
