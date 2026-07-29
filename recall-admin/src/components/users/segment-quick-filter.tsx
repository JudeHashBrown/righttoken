import styles from "@/components/workspaces/workspace.module.css";

const segments = ["", "F", "A", "B", "C", "D", "E", "G"] as const;

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
          const selected = segment === selectedSegment;

          return (
            <button
              aria-pressed={selected}
              className={`${styles.segmentQuickButton} ${
                selected ? styles.segmentQuickButtonSelected : ""
              }`}
              key={segment || "all"}
              name="segment"
              type="submit"
              value={segment}
            >
              {segment || "全部"}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
