"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

export function MemberWecomMappingForm(props: {
  memberId: string;
  initialWecomUserId: string | null;
  active: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const [value, setValue] = useState(
    props.initialWecomUserId ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/members/${props.memberId}/wecom`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wecomUserId: value.trim() || null
          })
        }
      );
      if (!response.ok) {
        setError(
          response.status === 409
            ? "该企业微信成员账号已分配给其他成员"
            : "映射未保存"
        );
        return;
      }
      router.refresh();
    } catch {
      setError("网络连接异常");
    } finally {
      setSaving(false);
    }
  }

  const state = !props.active
    ? "成员已停用"
    : props.initialWecomUserId
      ? "已映射"
      : "未映射";

  return (
    <form className={styles.inlineActions} onSubmit={save}>
      <span
        className={
          !props.active
            ? styles.statusDown
            : props.initialWecomUserId
              ? styles.statusGood
              : styles.statusWaiting
        }
      >
        {state}
      </span>
      <label className={styles.srOnly} htmlFor={`wecom-${props.memberId}`}>
        企业微信成员账号
      </label>
      <input
        className={styles.input}
        id={`wecom-${props.memberId}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="在企业微信通讯录中查看"
        disabled={saving}
      />
      <button
        className={styles.secondaryButton}
        type="submit"
        disabled={saving}
      >
        {saving ? "保存中" : "保存"}
      </button>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
