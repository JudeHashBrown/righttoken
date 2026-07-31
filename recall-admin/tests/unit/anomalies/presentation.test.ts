import { describe, expect, it } from "vitest";

import { presentServiceAnomaly } from "@/modules/anomalies/presentation";

describe("presentServiceAnomaly", () => {
  it("presents an upstream failure with actionable evidence", () => {
    const result = presentServiceAnomaly({
      anomalyActive: true,
      anomalyErrorPhase: "upstream",
      anomalyErrorType: "provider_error",
      anomalyErrorMessage: "no accounts available",
      anomalyErrorOwner: "provider",
      anomalyStatusCode: 502,
      anomalyModel: "gpt-5",
      anomalyPlatform: "openai",
      anomalyRequestCount: 5,
      anomalyFailureCount: 4,
      anomalyConsecutiveFailures: 3,
      anomalyLastOccurredAt: new Date("2026-07-24T07:42:00.000Z")
    });

    expect(result).toMatchObject({
      category: "上游服务异常",
      title: "上游服务异常 · HTTP 502",
      diagnosis: "上游无可用账号",
      rawError: "no accounts available",
      summary: "近30分钟失败 4/5 · 最近发生 07/24 15:42",
      metadata: ["provider_error", "gpt-5", "openai"],
      taskReason:
        "上游服务异常（HTTP 502），近30分钟5次请求失败4次，错误类型 provider_error，模型 gpt-5，最近发生于07/24 15:42。"
    });
  });

  it.each([
    ["routing", "platform", null, "平台路由异常"],
    ["internal", "platform", null, "平台内部异常"],
    ["upstream", "provider", "network_error", "网络异常"]
  ])(
    "maps %s/%s/%s to %s",
    (phase, owner, type, category) => {
      expect(
        presentServiceAnomaly({
          anomalyActive: true,
          anomalyErrorPhase: phase,
          anomalyErrorType: type,
          anomalyErrorMessage: null,
          anomalyErrorOwner: owner,
          anomalyStatusCode: null,
          anomalyModel: null,
          anomalyPlatform: null,
          anomalyRequestCount: null,
          anomalyFailureCount: null,
          anomalyConsecutiveFailures: null,
          anomalyLastOccurredAt: null
        })?.category
      ).toBe(category);
    }
  );

  it("falls back without inventing missing technical details", () => {
    expect(
      presentServiceAnomaly({
        anomalyActive: true,
        anomalyErrorPhase: null,
        anomalyErrorType: null,
        anomalyErrorMessage: null,
        anomalyErrorOwner: null,
        anomalyStatusCode: null,
        anomalyModel: null,
        anomalyPlatform: null,
        anomalyRequestCount: null,
        anomalyFailureCount: null,
        anomalyConsecutiveFailures: 3,
        anomalyLastOccurredAt: null
      })
    ).toEqual({
      category: "服务调用异常",
      title: "服务调用异常",
      diagnosis: "未返回可识别的具体错误类型",
      rawError: null,
      summary: "连续失败 3 次",
      metadata: [],
      taskReason:
        "服务调用异常，连续失败3次。"
    });
  });

  it("returns null when there is no active anomaly", () => {
    expect(
      presentServiceAnomaly({
        anomalyActive: false,
        anomalyErrorPhase: "upstream",
        anomalyErrorType: "provider_error",
        anomalyErrorMessage: null,
        anomalyErrorOwner: "provider",
        anomalyStatusCode: 502,
        anomalyModel: null,
        anomalyPlatform: null,
        anomalyRequestCount: 5,
        anomalyFailureCount: 4,
        anomalyConsecutiveFailures: 3,
        anomalyLastOccurredAt: new Date()
      })
    ).toBeNull();
  });

  it.each([
    [
      "no_available_account",
      null,
      "provider",
      "上游无可用账号"
    ],
    [
      "provider_error",
      "insufficient quota",
      "provider",
      "上游账户额度不足"
    ],
    [
      "billing_error",
      "insufficient balance",
      "client",
      "用户余额不足"
    ],
    [
      "connection_timeout",
      "connect ETIMEDOUT",
      "platform",
      "链路或网络错误"
    ],
    [
      "route_unavailable",
      null,
      "platform",
      "平台路由错误"
    ],
    [
      "internal_error",
      null,
      "platform",
      "平台内部错误"
    ],
    [
      "provider_error",
      "upstream rejected request",
      "provider",
      "上游服务错误"
    ]
  ])(
    "diagnoses %s / %s as %s",
    (errorType, errorMessage, owner, diagnosis) => {
      expect(
        presentServiceAnomaly({
          anomalyActive: true,
          anomalyErrorPhase:
            errorType === "route_unavailable"
              ? "routing"
              : errorType === "internal_error"
                ? "internal"
                : "upstream",
          anomalyErrorType: errorType,
          anomalyErrorMessage: errorMessage,
          anomalyErrorOwner: owner,
          anomalyStatusCode: 503,
          anomalyModel: null,
          anomalyPlatform: null,
          anomalyRequestCount: null,
          anomalyFailureCount: null,
          anomalyConsecutiveFailures: 3,
          anomalyLastOccurredAt: null
        })
      ).toMatchObject({
        diagnosis,
        rawError: errorMessage ?? errorType
      });
    }
  );
});
