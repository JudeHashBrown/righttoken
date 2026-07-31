"use client";

import styles from "@/components/workspaces/workspace.module.css";

export type TableHeaderFilterOption = {
  value: string;
  label: string;
};

export function TableHeaderFilter({
  label,
  name,
  value,
  options,
  formId
}: {
  label: string;
  name: string;
  value: string;
  options: TableHeaderFilterOption[];
  formId?: string;
}): React.JSX.Element {
  return (
    <label className={styles.tableHeaderFilter}>
      <span>{label}</span>
      <select
        aria-label={`筛选${label}`}
        className={styles.tableHeaderSelect}
        form={formId}
        name={name}
        onChange={(event) =>
          event.currentTarget.form?.requestSubmit()
        }
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
