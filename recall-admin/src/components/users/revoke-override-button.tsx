"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/workspaces/workspace.module.css";

export function RevokeOverrideButton({
  userId,
  overrideId
}: {
  userId: string;
  overrideId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/users/${userId}/segment-override`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ overrideId })
        }
      );
      if (!response.ok) {
        throw new Error("撤销失败，请刷新后重试");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "撤销失败"
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className={styles.secondaryButton}
        disabled={pending}
        onClick={revoke}
        type="button"
      >
        {pending ? "撤销中…" : "撤销临时分组"}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
