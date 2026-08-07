"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BGroupSelectedUser } from "@/modules/b-group/types";
import styles from "./b-group.module.css";

export function BGroupCouponPanel({ user }: { user: BGroupSelectedUser }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function grant() {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/b-group/users/${user.id}/coupon`, {
      method: "POST"
    });
    setPending(false);
    if (response.status === 503) {
      setMessage("首充激励服务未连接，暂时无法发放。");
      return;
    }
    if (!response.ok) {
      setMessage("首充激励发放失败，请稍后重试。");
      return;
    }
    setMessage("首充激励已发放");
    router.refresh();
  }

  return (
    <section className={styles.panel}>
      <h2>完成首充激励</h2>
      <p>
        运营权限范围内，可以选择将现有“首充多赠5%”的优惠加码到只要用户完成首充，除原本充100%得105%之外，可以只要用户完成首充，“额外首单激励10RMB”。
      </p>
      {message ? <p role="status">{message}</p> : null}
      <button
        className={styles.primary}
        disabled={pending || user.coupon?.status === "SUCCEEDED"}
        onClick={grant}
      >
        {user.coupon?.status === "SUCCEEDED"
          ? "已发放"
          : pending
            ? "发放中…"
            : "确认发放"}
      </button>
    </section>
  );
}
