import { describe, expect, it } from "vitest";

import {
  presentTaskServiceAnomaly,
  serializeServiceAnomalySnapshot
} from "@/modules/anomalies/task-presentation";

const clearedUserAnomaly = {
  anomalyActive: false,
  anomalyErrorPhase: null,
  anomalyErrorType: null,
  anomalyErrorMessage: null,
  anomalyErrorOwner: null,
  anomalyStatusCode: null,
  anomalyModel: null,
  anomalyPlatform: null,
  anomalyRequestCount: null,
  anomalyFailureCount: null,
  anomalyConsecutiveFailures: null,
  anomalyLastOccurredAt: null
};

describe("task anomaly presentation", () => {
  it("keeps showing a task snapshot after the user anomaly clears", () => {
    const snapshot = serializeServiceAnomalySnapshot({
      ...clearedUserAnomaly,
      anomalyActive: true,
      anomalyErrorPhase: "upstream",
      anomalyErrorType: "no_available_account",
      anomalyErrorMessage: "no accounts available",
      anomalyErrorOwner: "provider",
      anomalyStatusCode: 503,
      anomalyRequestCount: 12,
      anomalyFailureCount: 12,
      anomalyConsecutiveFailures: 5,
      anomalyLastOccurredAt: new Date("2026-07-31T03:11:00.000Z")
    });

    expect(
      presentTaskServiceAnomaly({
        triggerKey: "F:active_anomaly:2026-07-31T03:00:00.000Z",
        title: "用户遇到异常需要紧急介入",
        anomalySnapshot: snapshot,
        user: clearedUserAnomaly
      })
    ).toMatchObject({
      diagnosis: "上游无可用账号",
      rawError: "no accounts available"
    });
  });

  it("shows an explicit unknown-error highlight for legacy anomaly tasks", () => {
    expect(
      presentTaskServiceAnomaly({
        triggerKey: "safe-seed:service-anomaly",
        title: "服务异常需要立即介入",
        anomalySnapshot: null,
        user: clearedUserAnomaly
      })
    ).toMatchObject({
      diagnosis: "未返回可识别的具体错误类型",
      rawError: null
    });
  });

  it("does not show an anomaly highlight on unrelated tasks", () => {
    expect(
      presentTaskServiceAnomaly({
        triggerKey: "B:checkout_unpaid:2026-07-31T03:00:00.000Z",
        title: "发起结账后尚未支付",
        anomalySnapshot: null,
        user: clearedUserAnomaly
      })
    ).toBeNull();
  });
});
