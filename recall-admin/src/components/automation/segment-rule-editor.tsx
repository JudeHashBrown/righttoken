"use client";

import {
  useEffect,
  useMemo,
  useState
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  History,
  LockKeyhole,
  Plus,
  RotateCcw,
  Trash2,
  X
} from "lucide-react";
import type {
  ConditionOperator,
  PublicSegmentFieldDefinition,
  SegmentFieldKey
} from "@/modules/segmentation/field-registry";
import type {
  SegmentClause,
  SegmentGroupRule,
  SegmentRuleSet
} from "@/modules/segmentation/rule-definition";
import { describeOperationalClause } from "@/modules/segmentation/operational-copy";
import { presentRunStatus } from "@/modules/presentation/status";
import type { SegmentCode } from "@/modules/segmentation/types";
import styles from "./segment-rule-editor.module.css";

type Distribution = Record<SegmentCode, number>;

type SegmentRuleEditorProps = {
  initialRuleSet: SegmentRuleSet;
  fieldRegistry: PublicSegmentFieldDefinition[];
  distribution: Distribution;
  canEdit: boolean;
  topLayout?: boolean;
};

type Preview = {
  totalUsers: number;
  distribution: Distribution;
  migrations: number;
  overlapUsers: number;
  fallbackUsers: number;
  tasksToCancel: number;
  tasksToCreate: number;
  urgentTasksToCreate: number;
  token: string;
  expiresAt: string;
};

type RuleHistoryVersion = {
  id: string;
  version: number;
  active: boolean;
  createdAt: string;
  createdBy: string;
  changeSummary: string;
  runs: Array<{
    id: string;
    status: string;
    totalUsers: number;
    processedUsers: number;
    failedUsers: number;
  }>;
};

type RecalculationProgress = {
  status: string;
  totalUsers: number;
  processedUsers: number;
  succeededUsers: number;
  failedUsers: number;
};

const operatorLabels: Record<ConditionOperator, string> = {
  eq: "为",
  neq: "不是",
  in: "属于列表",
  not_in: "不属于列表",
  gt: "高于",
  gte: "不少于",
  lt: "低于",
  lte: "不超过",
  between: "在范围内",
  before: "早于",
  before_or_equal: "不晚于",
  after: "晚于",
  after_or_equal: "不早于",
  is_null: "暂无记录",
  is_not_null: "已有记录"
};

const priorityLabels = {
  NORMAL: "普通",
  IMPORTANT: "重要",
  URGENT: "紧急"
} as const;

function cloneRuleSet(ruleSet: SegmentRuleSet): SegmentRuleSet {
  return structuredClone(ruleSet);
}

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `segment-${Date.now()}-${Math.random()}`;
}

function defaultValue(field: PublicSegmentFieldDefinition) {
  if (field.type === "boolean") return true;
  if (field.type === "number" || field.type === "duration") return 0;
  if (field.type === "date") return new Date().toISOString();
  if (field.type === "country") return "US";
  if (field.type === "ip") return "127.0.0.1";
  if (field.type === "domain") return "example.com";
  if (field.type === "enum") return field.options?.[0]?.value ?? "NONE";
  return "direct";
}

function createClause(
  field: PublicSegmentFieldDefinition
): SegmentClause {
  const operator = field.operators[0]!;
  return {
    field: field.key,
    operator,
    value: defaultValue(field),
    ...(field.type === "duration"
      ? { unit: field.units?.[0] ?? "minutes" }
      : {})
  } as SegmentClause;
}

function clauseValueText(clause: SegmentClause): string {
  return Array.isArray(clause.value)
    ? clause.value.join(", ")
    : String(clause.value ?? "");
}

function booleanValueLabels(
  field: SegmentFieldKey
): [affirmative: string, negative: string] {
  const labels: Partial<
    Record<SegmentFieldKey, [string, string]>
  > = {
    anomalyActive: ["存在", "不存在"],
    checkoutStarted: ["已进入", "未进入"],
    unsubscribed: ["已退订", "未退订"],
    paused: ["已暂停", "未暂停"]
  };
  return labels[field] ?? ["是", "否"];
}

function friendlySummary(
  group: SegmentGroupRule,
  fields: Map<SegmentFieldKey, PublicSegmentFieldDefinition>
): string {
  if (group.code === "G") {
    return "前面的分组都未命中时，用户自动进入 G 组。";
  }
  if (!group.enabled) return `${group.code} 组当前未启用。`;
  const branches = group.branches.map((branch) =>
    branch.clauses
      .map((clause) =>
        describeOperationalClause(
          clause,
          fields.get(clause.field)?.label
        )
      )
      .join("，并且 ")
  );
  return `如果 ${branches.join("；或者 ")}，则进入 ${group.code} 组。`;
}

export function SegmentRuleEditor({
  initialRuleSet,
  fieldRegistry,
  distribution,
  canEdit,
  topLayout = false
}: SegmentRuleEditorProps): React.JSX.Element {
  const router = useRouter();
  const [draft, setDraft] = useState(() => cloneRuleSet(initialRuleSet));
  const [expanded, setExpanded] = useState<SegmentCode[]>(["F"]);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [changeSummary, setChangeSummary] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<RuleHistoryVersion[]>([]);
  const [rollbackTarget, setRollbackTarget] =
    useState<RuleHistoryVersion | null>(null);
  const [rollbackSummary, setRollbackSummary] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runProgress, setRunProgress] =
    useState<RecalculationProgress | null>(null);

  const fieldMap = useMemo(
    () => new Map(fieldRegistry.map((field) => [field.key, field])),
    [fieldRegistry]
  );
  const displayOrder: SegmentCode[] = ["F", "A", "B", "C", "D", "E", "G"];
  const displayGroups = displayOrder
    .map((code) => draft.groups.find((group) => group.code === code))
    .filter((group): group is SegmentGroupRule => Boolean(group));

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/automation/segment-rules/runs/${activeRunId}`
        );
        const result = (await response.json().catch(() => null)) as {
          run?: RecalculationProgress;
        } | null;
        if (!response.ok || !result?.run || cancelled) return;
        setRunProgress(result.run);
        if (
          ["COMPLETED", "PARTIAL_FAILURE", "FAILED"].includes(
            result.run.status
          )
        ) {
          setActiveRunId(null);
          router.refresh();
          return;
        }
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, 2_000);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeRunId, router]);

  function mutate(
    updater: (next: SegmentRuleSet) => void
  ): void {
    setDraft((current) => {
      const next = cloneRuleSet(current);
      updater(next);
      next.groups.forEach((group, index) => {
        group.order = index;
      });
      return next;
    });
    setDirty(true);
    setPreview(null);
    setMessage(null);
    setError(null);
  }

  function updateGroup(
    code: SegmentCode,
    updater: (group: SegmentGroupRule) => void
  ): void {
    mutate((next) => {
      updater(next.groups.find((group) => group.code === code)!);
    });
  }

  function moveGroup(code: SegmentCode, direction: -1 | 1): void {
    mutate((next) => {
      const index = next.groups.findIndex((group) => group.code === code);
      const target = index + direction;
      if (target < 1 || target >= next.groups.length - 1) return;
      [next.groups[index], next.groups[target]] = [
        next.groups[target]!,
        next.groups[index]!
      ];
    });
  }

  function changeField(
    code: SegmentCode,
    branchIndex: number,
    clauseIndex: number,
    fieldKey: SegmentFieldKey
  ): void {
    updateGroup(code, (group) => {
      group.branches[branchIndex]!.clauses[clauseIndex] =
        createClause(fieldMap.get(fieldKey)!);
    });
  }

  function changeOperator(
    code: SegmentCode,
    branchIndex: number,
    clauseIndex: number,
    operator: ConditionOperator
  ): void {
    updateGroup(code, (group) => {
      const clause = group.branches[branchIndex]!.clauses[clauseIndex]!;
      clause.operator = operator;
      if (operator === "is_null" || operator === "is_not_null") {
        delete clause.value;
      } else if (operator === "between") {
        clause.value = [0, 1];
      } else if (operator === "in" || operator === "not_in") {
        const value = Array.isArray(clause.value)
          ? clause.value[0]
          : clause.value;
        clause.value = [String(value ?? "")];
      } else if (Array.isArray(clause.value)) {
        clause.value = clause.value[0] ?? "";
      }
    });
  }

  function changeValue(
    code: SegmentCode,
    branchIndex: number,
    clauseIndex: number,
    value: string
  ): void {
    updateGroup(code, (group) => {
      const clause = group.branches[branchIndex]!.clauses[clauseIndex]!;
      const field = fieldMap.get(clause.field)!;
      if (field.type === "boolean") {
        clause.value = value === "true";
      } else if (
        field.type === "number" ||
        field.type === "duration"
      ) {
        clause.value =
          clause.operator === "between"
            ? value.split(",").map(Number).slice(0, 2) as [number, number]
            : Number(value);
      } else if (
        clause.operator === "in" ||
        clause.operator === "not_in"
      ) {
        clause.value = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      } else if (field.type === "date") {
        clause.value = new Date(value).toISOString();
      } else {
        clause.value = value;
      }
    });
  }

  async function requestPreview(): Promise<void> {
    setPreviewing(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/automation/segment-rules/preview",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            draft: { ...draft, changeSummary: "" }
          })
        }
      );
      const result = (await response.json().catch(() => null)) as
        | Preview
        | null;
      if (!response.ok || !result?.token) {
        throw new Error("preview rejected");
      }
      setPreview(result);
    } catch {
      setError("无法预览分组结果，请检查筛选条件后重试。");
    } finally {
      setPreviewing(false);
    }
  }

  async function publish(): Promise<void> {
    if (!preview || changeSummary.trim().length < 4) {
      setError("请填写至少 4 个字的变更说明。");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const response = await fetch("/api/automation/segment-rules", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": newIdempotencyKey()
        },
        body: JSON.stringify({
          draft: { ...draft, changeSummary: "" },
          previewToken: preview.token,
          changeSummary: changeSummary.trim()
        })
      });
      const result = (await response.json().catch(() => null)) as {
        version?: number;
        runId?: string;
      } | null;
      if (!response.ok || !result?.version) {
        throw new Error("publish rejected");
      }
      setMessage(
        `分组方案 v${result.version} 已保存，正在整理用户分组`
      );
      setActiveRunId(result.runId ?? null);
      setRunProgress(null);
      setPreview(null);
      setDirty(false);
      setChangeSummary("");
      router.refresh();
    } catch {
      setError("分组方案未能保存，当前修改已保留，请重新预览后再试。");
    } finally {
      setPublishing(false);
    }
  }

  async function loadHistory(): Promise<void> {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (!nextOpen || history.length > 0) return;
    setHistoryLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/automation/segment-rules/history"
      );
      const result = (await response.json().catch(() => null)) as {
        versions?: RuleHistoryVersion[];
      } | null;
      if (!response.ok || !result?.versions) {
        throw new Error("history unavailable");
      }
      setHistory(result.versions);
    } catch {
      setError("方案记录暂时无法加载，请稍后重试。");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function retryRun(runId: string): Promise<void> {
    setError(null);
    try {
      const response = await fetch(
        `/api/automation/segment-rules/runs/${runId}/retry`,
        {
          method: "POST",
          headers: {
            "idempotency-key": newIdempotencyKey()
          }
        }
      );
      if (!response.ok) throw new Error("retry failed");
      setMessage("未完成的用户已开始重新整理");
      setHistory([]);
      setHistoryOpen(false);
      router.refresh();
    } catch {
      setError("暂时无法重新整理这些用户，请稍后再试。");
    }
  }

  async function rollback(): Promise<void> {
    if (!rollbackTarget || rollbackSummary.trim().length < 4) {
      setError("请填写至少 4 个字的恢复说明。");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/automation/segment-rules/versions/${
          rollbackTarget.id
        }/rollback`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": newIdempotencyKey()
          },
          body: JSON.stringify({
            changeSummary: rollbackSummary.trim()
          })
        }
      );
      const result = (await response.json().catch(() => null)) as {
        version?: number;
      } | null;
      if (!response.ok || !result?.version) {
        throw new Error("rollback failed");
      }
      setMessage(
        `已恢复为方案 v${result.version}，正在重新整理全部用户`
      );
      setRollbackTarget(null);
      setRollbackSummary("");
      setHistory([]);
      setHistoryOpen(false);
      router.refresh();
    } catch {
      setError("暂时无法恢复该方案，请稍后重试。");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section className={`${styles.builder} ${topLayout ? styles.builderOnTop : ""}`}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          <button
            className={styles.secondary}
            type="button"
            onClick={loadHistory}
          >
            <History size={15} />
            {historyOpen ? "收起方案记录" : "查看方案记录"}
          </button>
          {canEdit ? (
            <button
              className={styles.primary}
              type="button"
              onClick={requestPreview}
              disabled={previewing || publishing}
            >
              {previewing ? "正在计算影响" : "预览并发布"}
            </button>
          ) : null}
        </div>
      </div>

      {historyOpen ? (
        <section className={styles.historyPanel}>
          <header>
            <div>
              <strong>分组方案记录</strong>
              <span>历史方案不可修改，但可以恢复后重新使用</span>
            </div>
          </header>
          {historyLoading ? (
            <p className={styles.historyEmpty}>正在加载方案记录…</p>
          ) : history.length ? (
            <div className={styles.historyList}>
              {history.map((version) => {
                const run = version.runs[0];
                return (
                  <div className={styles.historyRow} key={version.id}>
                    <span className={styles.versionBadge}>
                      v{version.version}
                    </span>
                    <div>
                      <strong>
                        {version.changeSummary || "未填写变更说明"}
                      </strong>
                      <p>
                        {version.createdBy} ·{" "}
                        {new Date(version.createdAt).toLocaleString(
                          "zh-CN"
                        )}
                      </p>
                    </div>
                    <div className={styles.runSummary}>
                      <span>{version.active ? "当前使用" : "历史方案"}</span>
                      <small>
                        {run
                          ? `${presentRunStatus(run.status)} · ${run.processedUsers}/${
                              run.totalUsers
                            } 位已完成 · ${run.failedUsers} 位未完成`
                          : "暂无用户整理记录"}
                      </small>
                    </div>
                    {canEdit ? (
                      <div className={styles.historyActions}>
                        {run &&
                        (run.status === "FAILED" ||
                          run.status === "PARTIAL_FAILURE") ? (
                          <button
                            className={styles.secondary}
                            type="button"
                            onClick={() => retryRun(run.id)}
                          >
                            重新整理未完成用户
                          </button>
                        ) : null}
                        {!version.active ? (
                          <button
                            className={styles.secondary}
                            type="button"
                            onClick={() => {
                              setRollbackTarget(version);
                              setRollbackSummary(
                                `恢复到方案 v${version.version}：`
                              );
                            }}
                          >
                            恢复此方案
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.historyEmpty}>暂无历史方案。</p>
          )}
        </section>
      ) : null}

      <div className={styles.groupRail} role="group" aria-label="用户分组导航">
        {displayGroups.map((group) => {
          const isOpen = expanded.includes(group.code);
          const isLocked = group.code === "F" || group.code === "G";
          return (
            <button
              className={`${styles.groupRailItem} ${isOpen ? styles.groupRailItemActive : ""}`}
              key={group.code}
              type="button"
              onClick={() => setExpanded([group.code])}
              aria-pressed={isOpen}
            >
              <span className={`${styles.groupRailCode} ${group.code === "F" ? styles.groupCodeUrgent : group.code === "G" ? styles.groupCodeFallback : ""}`}>
                {group.code}
              </span>
              <span className={styles.groupRailMeta}>
                <strong>{distribution[group.code]} 人</strong>
                <span>{group.annotation || friendlySummary(group, fieldMap)}</span>
              </span>
              {isLocked ? <LockKeyhole size={13} /> : null}
            </button>
          );
        })}
      </div>

      <div className={styles.groupList}>
        {displayGroups.filter((group) => expanded.includes(group.code)).map((group) => {
          const groupIndex = draft.groups.findIndex((item) => item.code === group.code);
          const isLocked = group.code === "F" || group.code === "G";
          const isOpen = expanded.includes(group.code);
          const movable = !isLocked;
          return (
            <article className={styles.groupCard} key={group.code}>
              <header className={styles.groupHeader}>
                <span
                  className={`${styles.groupCode} ${
                    group.code === "F"
                      ? styles.groupCodeUrgent
                      : group.code === "G"
                        ? styles.groupCodeFallback
                        : ""
                  }`}
                >
                  {group.code}
                </span>
                <div className={styles.groupIdentity}>
                  <h2>{group.code} 组</h2>
                  <span>{distribution[group.code]} 人</span>
                </div>
                <p className={styles.groupSummary}>
                  {group.annotation || friendlySummary(group, fieldMap)}
                </p>
                <div className={styles.groupActions}>
                  {movable && canEdit ? (
                    <>
                      <button
                        aria-label={`${group.code} 组上移`}
                        type="button"
                        onClick={() => moveGroup(group.code, -1)}
                        disabled={groupIndex === 1}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        aria-label={`${group.code} 组下移`}
                        type="button"
                        onClick={() => moveGroup(group.code, 1)}
                        disabled={groupIndex === draft.groups.length - 2}
                      >
                        <ArrowDown size={15} />
                      </button>
                    </>
                  ) : (
                    <LockKeyhole
                      aria-label={`${group.code} 组顺序已锁定`}
                      size={15}
                    />
                  )}
                  <button
                    aria-label={`${group.code} 组${
                      isOpen ? "收起" : "展开"
                    }`}
                    type="button"
                    onClick={() =>
                      setExpanded((items) =>
                        items.includes(group.code)
                          ? items.filter((code) => code !== group.code)
                          : [...items, group.code]
                      )
                    }
                  >
                    <ChevronDown
                      className={isOpen ? styles.chevronOpen : ""}
                      size={16}
                    />
                  </button>
                </div>
              </header>

              {isOpen ? (
                <div className={styles.groupBody}>
                  <div className={styles.annotationField}>
                    <label htmlFor={`annotation-${group.code}`}>
                      {group.code} 组说明
                    </label>
                    <input
                      id={`annotation-${group.code}`}
                      value={group.annotation}
                      disabled={!canEdit}
                      maxLength={500}
                      onChange={(event) =>
                        updateGroup(group.code, (target) => {
                          target.annotation = event.target.value;
                        })
                      }
                    />
                  </div>

                  {group.code === "G" ? (
                    <div className={styles.lockedNote}>
                      <LockKeyhole size={16} />
                      <div>
                        <strong>G 组自动接收其他用户</strong>
                        <p>
                          不符合前面分组条件的用户会进入 G 组，系统不会为其自动创建个人跟进任务。
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.sectionHeading}>
                        <div>
                          <strong>筛选条件（满足这些条件的用户会归入此组）</strong>
                        </div>
                        {canEdit ? (
                          <button
                            className={styles.textButton}
                            type="button"
                            onClick={() =>
                              updateGroup(group.code, (target) => {
                                target.branches.push({
                                  clauses: [
                                    createClause(fieldRegistry[0]!)
                                  ]
                                });
                              })
                            }
                          >
                            <Plus size={14} /> 添加一组筛选条件
                          </button>
                        ) : null}
                      </div>
                      <div className={styles.branchList}>
                        {group.branches.map((branch, branchIndex) => (
                          <div
                            className={styles.branch}
                            key={`${group.code}-${branchIndex}`}
                          >
                            <div className={styles.branchHeader}>
                              <strong>筛选方案 {branchIndex + 1}</strong>
                              <span>
                                  {branchIndex === 0 ? "主要" : "补充"}
                              </span>
                              {canEdit ? (
                                <div>
                                  <button
                                    aria-label={`复制 ${group.code} 组条件组 ${
                                      branchIndex + 1
                                    }`}
                                    type="button"
                                    onClick={() =>
                                      updateGroup(
                                        group.code,
                                        (target) => {
                                          target.branches.splice(
                                            branchIndex + 1,
                                            0,
                                            structuredClone(branch)
                                          );
                                        }
                                      )
                                    }
                                  >
                                    <Copy size={14} />
                                  </button>
                                  {group.branches.length > 1 ? (
                                    <button
                                      aria-label={`删除 ${group.code} 组条件组 ${
                                        branchIndex + 1
                                      }`}
                                      type="button"
                                      onClick={() =>
                                        updateGroup(
                                          group.code,
                                          (target) => {
                                            target.branches.splice(
                                              branchIndex,
                                              1
                                            );
                                          }
                                        )
                                      }
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            {branch.clauses.map((clause, clauseIndex) => {
                              const field = fieldMap.get(clause.field)!;
                              const hidesValue =
                                clause.operator === "is_null" ||
                                clause.operator === "is_not_null";
                              const booleanLabels =
                                booleanValueLabels(clause.field);
                              return (
                                <div
                                  className={styles.conditionWrap}
                                  key={`${clause.field}-${clauseIndex}`}
                                >
                                  {clauseIndex > 0 ? (
                                    <span className={styles.andPill}>
                                      并且
                                    </span>
                                  ) : null}
                                  <div className={styles.condition}>
                                    <label>
                                      <span>筛选依据</span>
                                      <select
                                        aria-label={`${group.code} 组分支 ${
                                          branchIndex + 1
                                        }条件 ${clauseIndex + 1}筛选依据`}
                                        value={clause.field}
                                        disabled={!canEdit}
                                        onChange={(event) =>
                                          changeField(
                                            group.code,
                                            branchIndex,
                                            clauseIndex,
                                            event.target
                                              .value as SegmentFieldKey
                                          )
                                        }
                                      >
                                        {fieldRegistry.map((option) => (
                                          <option
                                            key={option.key}
                                            value={option.key}
                                          >
                                            {option.category} · {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      <span>条件</span>
                                      <select
                                        value={clause.operator}
                                        disabled={!canEdit}
                                        onChange={(event) =>
                                          changeOperator(
                                            group.code,
                                            branchIndex,
                                            clauseIndex,
                                            event.target
                                              .value as ConditionOperator
                                          )
                                        }
                                      >
                                        {field.operators.map((operator) => (
                                          <option
                                            key={operator}
                                            value={operator}
                                          >
                                            {operatorLabels[operator]}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    {!hidesValue ? (
                                      <label className={styles.valueField}>
                                        <span>目标</span>
                                        {field.type === "boolean" ? (
                                          <select
                                            value={String(clause.value)}
                                            disabled={!canEdit}
                                            onChange={(event) =>
                                              changeValue(
                                                group.code,
                                                branchIndex,
                                                clauseIndex,
                                                event.target.value
                                              )
                                            }
                                          >
                                            <option value="true">
                                              {booleanLabels[0]}
                                            </option>
                                            <option value="false">
                                              {booleanLabels[1]}
                                            </option>
                                          </select>
                                        ) : field.type === "enum" &&
                                          clause.operator !== "in" &&
                                          clause.operator !== "not_in" ? (
                                          <select
                                            value={String(clause.value)}
                                            disabled={!canEdit}
                                            onChange={(event) =>
                                              changeValue(
                                                group.code,
                                                branchIndex,
                                                clauseIndex,
                                                event.target.value
                                              )
                                            }
                                          >
                                            {field.options?.map((option) => (
                                              <option
                                                key={option.value}
                                                value={option.value}
                                              >
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <input
                                            type={
                                              field.type === "number" ||
                                              field.type === "duration"
                                                ? "text"
                                                : field.type === "date"
                                                  ? "datetime-local"
                                                  : "text"
                                            }
                                            value={
                                              field.type === "date"
                                                ? String(clause.value)
                                                    .slice(0, 16)
                                                : clauseValueText(clause)
                                            }
                                            disabled={!canEdit}
                                            placeholder={
                                              clause.operator === "between"
                                                ? "范围起点, 范围终点"
                                                : clause.operator === "in" ||
                                                    clause.operator ===
                                                      "not_in"
                                                  ? "多个内容用逗号分隔"
                                                  : "请输入目标内容"
                                            }
                                            onChange={(event) =>
                                              changeValue(
                                                group.code,
                                                branchIndex,
                                                clauseIndex,
                                                event.target.value
                                              )
                                            }
                                          />
                                        )}
                                      </label>
                                    ) : null}
                                    {field.type === "duration" ? (
                                      <label>
                                        <span>单位</span>
                                        <select
                                          value={clause.unit}
                                          disabled={!canEdit}
                                          onChange={(event) =>
                                            updateGroup(
                                              group.code,
                                              (target) => {
                                                target.branches[
                                                  branchIndex
                                                ]!.clauses[
                                                  clauseIndex
                                                ]!.unit = event.target
                                                  .value as
                                                  | "minutes"
                                                  | "hours"
                                                  | "days";
                                              }
                                            )
                                          }
                                        >
                                          <option value="minutes">分钟</option>
                                          <option value="hours">小时</option>
                                          <option value="days">天</option>
                                        </select>
                                      </label>
                                    ) : null}
                                    {canEdit && branch.clauses.length > 1 ? (
                                      <button
                                        className={styles.deleteCondition}
                                        aria-label={`删除 ${group.code} 组条件 ${
                                          clauseIndex + 1
                                        }`}
                                        type="button"
                                        onClick={() =>
                                          updateGroup(
                                            group.code,
                                            (target) => {
                                              target.branches[
                                                branchIndex
                                              ]!.clauses.splice(
                                                clauseIndex,
                                                1
                                              );
                                            }
                                          )
                                        }
                                      >
                                        <X size={14} />
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                            {canEdit ? (
                              <button
                                className={styles.addCondition}
                                type="button"
                                onClick={() =>
                                  updateGroup(group.code, (target) => {
                                    target.branches[
                                      branchIndex
                                    ]!.clauses.push(
                                      createClause(fieldRegistry[0]!)
                                    );
                                  })
                                }
                              >
                                <Plus size={14} /> 添加筛选条件
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      <div className={styles.policy}>
                        <div className={styles.sectionHeading}>
                          <div>
                            <strong>跟进设置</strong>
                            <span>用户进入此组后是否需要团队跟进</span>
                          </div>
                        </div>
                        <div className={styles.policyGrid}>
                          <label className={styles.checkbox}>
                            <input
                              type="checkbox"
                              checked={group.taskPolicy.enabled}
                              disabled={
                                !canEdit ||
                                group.code === "F"
                              }
                              onChange={(event) =>
                                updateGroup(group.code, (target) => {
                                  target.taskPolicy.enabled =
                                    event.target.checked;
                                })
                              }
                            />
                            自动创建个人跟进任务
                          </label>
                          <label>
                            <span>多久后开始跟进（分钟）</span>
                            <input
                              type="number"
                              min={0}
                              value={group.taskPolicy.delayMinutes}
                              disabled={!canEdit || group.code === "F"}
                              onChange={(event) =>
                                updateGroup(group.code, (target) => {
                                  target.taskPolicy.delayMinutes =
                                    Number(event.target.value);
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>紧急程度</span>
                            <select
                              value={group.taskPolicy.priority}
                              disabled={!canEdit || group.code === "F"}
                              onChange={(event) =>
                                updateGroup(group.code, (target) => {
                                  target.taskPolicy.priority = event.target
                                    .value as
                                    | "NORMAL"
                                    | "IMPORTANT"
                                    | "URGENT";
                                })
                              }
                            >
                              {Object.entries(priorityLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                )
                              )}
                            </select>
                          </label>
                          <label>
                            <span>建议完成时间（分钟）</span>
                            <input
                              type="number"
                              min={1}
                              value={
                                group.taskPolicy.dueMinutesAfterCreation
                              }
                              disabled={!canEdit}
                              onChange={(event) =>
                                updateGroup(group.code, (target) => {
                                  target.taskPolicy.dueMinutesAfterCreation =
                                    Number(event.target.value);
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </>
                  )}
                  {canEdit && group.branches.length > 0 ? (
                    <button
                      className={styles.reset}
                      type="button"
                      onClick={() =>
                        mutate((next) => {
                          const original = initialRuleSet.groups.find(
                            (item) => item.code === group.code
                          )!;
                          const index = next.groups.findIndex(
                            (item) => item.code === group.code
                          );
                          next.groups[index] = structuredClone(original);
                        })
                      }
                    >
                      <RotateCcw size={14} />
                      恢复该组初始设置
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          <AlertTriangle size={15} />
          {error}
        </p>
      ) : null}
      {message ? (
        <p className={styles.success} role="status">
          <Check size={15} />
          {message}
        </p>
      ) : null}
      {runProgress ? (
        <div className={styles.progress} role="status">
          <div>
            <strong>{presentRunStatus(runProgress.status)}</strong>
            <span>
              {runProgress.processedUsers}/{runProgress.totalUsers} 位用户已完成，
              {runProgress.failedUsers} 位暂未完成
            </span>
          </div>
          <span className={styles.progressTrack}>
            <span
              className={styles.progressFill}
              style={{
                width: `${
                  runProgress.totalUsers
                    ? Math.min(
                        100,
                        (runProgress.processedUsers /
                          runProgress.totalUsers) *
                          100
                      )
                    : 0
                }%`
              }}
            />
          </span>
        </div>
      ) : null}

      {preview ? (
        <div className={styles.modalBackdrop}>
          <section
            aria-label="分组方案预览"
            className={styles.previewModal}
          >
            <header>
              <div>
                <span>保存前预览</span>
                <h2>确认新的分组结果</h2>
              </div>
              <button
                aria-label="关闭预览"
                type="button"
                onClick={() => setPreview(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div className={styles.previewMetrics}>
              <div>
                <span>全部用户</span>
                <strong>{preview.totalUsers} 人</strong>
              </div>
              <div>
                <span>分组发生变化</span>
                <strong>预计 {preview.migrations} 人</strong>
              </div>
              <div>
                <span>同时符合多个分组</span>
                <strong>{preview.overlapUsers} 人</strong>
              </div>
              <div>
                <span>不再需要的旧任务</span>
                <strong>{preview.tasksToCancel} 个</strong>
              </div>
              <div>
                <span>创建新任务</span>
                <strong>{preview.tasksToCreate} 个</strong>
              </div>
              <div>
                <span>F 组紧急任务</span>
                <strong>{preview.urgentTasksToCreate} 个</strong>
              </div>
            </div>
            <div className={styles.previewDistribution}>
              {Object.entries(preview.distribution).map(([code, count]) => (
                <span key={code}>
                  <b>{code}</b> {count} 人
                </span>
              ))}
            </div>
            <label className={styles.summaryInput}>
              <span>本次变更说明</span>
              <textarea
                value={changeSummary}
                maxLength={500}
                placeholder="例如：调整 E 组余额标准并提高 D 组跟进紧急程度"
                onChange={(event) => setChangeSummary(event.target.value)}
              />
            </label>
            <p className={styles.previewWarning}>
              保存后，新方案立即生效，系统会重新整理全部用户的分组。
              团队正在处理的任务不会被取消。
            </p>
            <footer>
              <button
                className={styles.secondary}
                type="button"
                onClick={() => setPreview(null)}
              >
                返回修改
              </button>
              <button
                className={styles.primary}
                type="button"
                disabled={publishing}
                onClick={publish}
              >
                {publishing ? "正在保存" : "确认保存新方案"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {rollbackTarget ? (
        <div className={styles.modalBackdrop}>
          <section
            aria-label="确认恢复历史分组方案"
            className={styles.previewModal}
          >
            <header>
              <div>
                <span>恢复历史方案</span>
                <h2>恢复到方案 v{rollbackTarget.version}</h2>
              </div>
              <button
                aria-label="关闭恢复确认"
                type="button"
                onClick={() => setRollbackTarget(null)}
              >
                <X size={18} />
              </button>
            </header>
            <label className={styles.summaryInput}>
              <span>恢复说明</span>
              <textarea
                value={rollbackSummary}
                maxLength={500}
                onChange={(event) =>
                  setRollbackSummary(event.target.value)
                }
              />
            </label>
            <p className={styles.previewWarning}>
              当前方案记录会保留。恢复后，系统会按照这套条件重新整理全部用户。
            </p>
            <footer>
              <button
                className={styles.secondary}
                type="button"
                onClick={() => setRollbackTarget(null)}
              >
                取消
              </button>
              <button
                className={styles.primary}
                type="button"
                disabled={publishing}
                onClick={rollback}
              >
                {publishing ? "正在恢复" : "确认恢复并使用"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
