import styles from "@/components/workspaces/workspace.module.css";

const segments = [
  { value: "", label: "全部", description: "全部用户" },
  { value: "F", label: "F", description: "服务异常" },
  { value: "A", label: "A", description: "仅注册" },
  { value: "B", label: "B", description: "未完成支付" },
  { value: "C", label: "C", description: "充值未调用" },
  { value: "D", label: "D", description: "长期未调用" },
  { value: "E", label: "E", description: "余额不足" },
  { value: "G", label: "G", description: "健康或其他" }
] as const;

export function SegmentQuickFilter({
  selectedSegment
}: {
  selectedSegment: string;
}): React.JSX.Element {
  return (
    <fieldset className={styles.segmentQuickFieldset}>
      <legend>分组</legend>
      <div className={styles.segmentQuickList}>
        {segments.map((segment) => {
          const selected = segment.value === selectedSegment;

          return (
            <button
              aria-label={`${segment.label} ${segment.description}`}
              aria-pressed={selected}
              className={`${styles.segmentQuickButton} ${
                selected ? styles.segmentQuickButtonSelected : ""
              }`}
              key={segment.value || "all"}
              name="segment"
              type="submit"
              value={segment.value}
            >
              <strong>{segment.label}</strong>
              <small>{segment.description}</small>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
