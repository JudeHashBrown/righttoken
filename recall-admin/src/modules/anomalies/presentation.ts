export type ServiceAnomalyPresentationInput = {
  anomalyActive: boolean;
  anomalyErrorPhase: string | null;
  anomalyErrorType: string | null;
  anomalyErrorMessage: string | null;
  anomalyErrorOwner: string | null;
  anomalyStatusCode: number | null;
  anomalyModel: string | null;
  anomalyPlatform: string | null;
  anomalyRequestCount: number | null;
  anomalyFailureCount: number | null;
  anomalyConsecutiveFailures: number | null;
  anomalyLastOccurredAt: Date | null;
};

export type ServiceAnomalyPresentation = {
  category: string;
  title: string;
  diagnosis: string;
  rawError: string | null;
  summary: string;
  metadata: string[];
  taskReason: string;
};

function compact(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function diagnosis(input: ServiceAnomalyPresentationInput): string {
  const phase = compact(input.anomalyErrorPhase)?.toLowerCase();
  const owner = compact(input.anomalyErrorOwner)?.toLowerCase();
  const evidence = [
    compact(input.anomalyErrorType),
    compact(input.anomalyErrorMessage)
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/gu, " ");

  if (
    evidence.includes("no accounts available") ||
    evidence.includes("no available account")
  ) {
    return "上游无可用账号";
  }
  if (
    evidence.includes("insufficient quota") ||
    evidence.includes("quota exceeded") ||
    evidence.includes("credit balance")
  ) {
    return "上游账户额度不足";
  }
  if (
    (owner === "client" || owner === "user") &&
    (evidence.includes("insufficient balance") ||
      evidence.includes("balance exhausted") ||
      evidence.includes("billing error"))
  ) {
    return "用户余额不足";
  }
  if (
    phase === "network" ||
    evidence.includes("network") ||
    evidence.includes("timeout") ||
    evidence.includes("timedout") ||
    evidence.includes("connection") ||
    evidence.includes("dns")
  ) {
    return "链路或网络错误";
  }
  if (phase === "routing" || evidence.includes("route unavailable")) {
    return "平台路由错误";
  }
  if (
    phase === "internal" ||
    owner === "platform" ||
    evidence.includes("internal error")
  ) {
    return "平台内部错误";
  }
  if (phase === "upstream" || owner === "provider") {
    return "上游服务错误";
  }
  return "未返回可识别的具体错误类型";
}

function anomalyCategory(
  input: ServiceAnomalyPresentationInput
): string {
  const phase = compact(input.anomalyErrorPhase)?.toLowerCase();
  const type = compact(input.anomalyErrorType)?.toLowerCase();
  const owner = compact(input.anomalyErrorOwner)?.toLowerCase();

  if (
    phase === "network" ||
    type?.includes("network") ||
    type?.includes("timeout")
  ) {
    return "网络异常";
  }
  if (phase === "routing") {
    return "平台路由异常";
  }
  if (owner === "provider" || phase === "upstream") {
    return "上游服务异常";
  }
  if (owner === "platform" || phase === "internal") {
    return "平台内部异常";
  }
  return "服务调用异常";
}

function displayTime(value: Date | null): string | null {
  if (!value || Number.isNaN(value.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(value);
}

function statusLabel(statusCode: number | null): string | null {
  return statusCode === null ? null : `HTTP ${statusCode}`;
}

function uniqueMetadata(
  values: Array<string | null>
): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

export function presentServiceAnomaly(
  input: ServiceAnomalyPresentationInput
): ServiceAnomalyPresentation | null {
  if (!input.anomalyActive) {
    return null;
  }

  const category = anomalyCategory(input);
  const status = statusLabel(input.anomalyStatusCode);
  const occurredAt = displayTime(input.anomalyLastOccurredAt);
  const errorType = compact(input.anomalyErrorType);
  const rawError =
    compact(input.anomalyErrorMessage) ?? errorType;
  const model = compact(input.anomalyModel);
  const hasWindowCounts =
    input.anomalyRequestCount !== null &&
    input.anomalyFailureCount !== null;
  const summaryParts: string[] = [];

  if (hasWindowCounts) {
    summaryParts.push(
      `近30分钟失败 ${input.anomalyFailureCount}/${input.anomalyRequestCount}`
    );
  } else if (input.anomalyConsecutiveFailures !== null) {
    summaryParts.push(
      `连续失败 ${input.anomalyConsecutiveFailures} 次`
    );
  }
  if (occurredAt) {
    summaryParts.push(`最近发生 ${occurredAt}`);
  }

  let taskReason = status
    ? `${category}（${status}）`
    : category;
  if (hasWindowCounts) {
    taskReason +=
      `，近30分钟${input.anomalyRequestCount}次请求失败` +
      `${input.anomalyFailureCount}次`;
    if (errorType) {
      taskReason += `，错误类型 ${errorType}`;
    }
    if (model) {
      taskReason += `，模型 ${model}`;
    }
    if (occurredAt) {
      taskReason += `，最近发生于${occurredAt}`;
    }
    taskReason += "。";
  } else if (input.anomalyConsecutiveFailures !== null) {
    taskReason +=
      `，连续失败${input.anomalyConsecutiveFailures}次`;
    if (errorType) {
      taskReason += `，错误类型 ${errorType}`;
    }
    if (model) {
      taskReason += `，模型 ${model}`;
    }
    taskReason += "。";
  } else {
    taskReason += occurredAt
      ? `，最近发生于${occurredAt}。`
      : "。详细分类暂未返回。";
  }

  return {
    category,
    title: status ? `${category} · ${status}` : category,
    diagnosis: diagnosis(input),
    rawError,
    summary: summaryParts.join(" · ") || "系统检测到持续调用失败",
    metadata: uniqueMetadata([
      errorType,
      model,
      compact(input.anomalyPlatform)
    ]),
    taskReason
  };
}
