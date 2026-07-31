import { z } from "zod";

import {
  presentServiceAnomaly,
  type ServiceAnomalyPresentation,
  type ServiceAnomalyPresentationInput
} from "@/modules/anomalies/presentation";

const nullableText = z.string().nullable();
const nullableInteger = z.number().int().nullable();

const serviceAnomalySnapshotSchema = z.object({
  anomalyErrorPhase: nullableText,
  anomalyErrorType: nullableText,
  anomalyErrorMessage: nullableText,
  anomalyErrorOwner: nullableText,
  anomalyStatusCode: nullableInteger,
  anomalyModel: nullableText,
  anomalyPlatform: nullableText,
  anomalyRequestCount: nullableInteger,
  anomalyFailureCount: nullableInteger,
  anomalyConsecutiveFailures: nullableInteger,
  anomalyLastOccurredAt: z.string().datetime().nullable()
});

export type ServiceAnomalySnapshot = z.infer<
  typeof serviceAnomalySnapshotSchema
>;

export function serializeServiceAnomalySnapshot(
  input: ServiceAnomalyPresentationInput
): ServiceAnomalySnapshot {
  return {
    anomalyErrorPhase: input.anomalyErrorPhase,
    anomalyErrorType: input.anomalyErrorType,
    anomalyErrorMessage: input.anomalyErrorMessage,
    anomalyErrorOwner: input.anomalyErrorOwner,
    anomalyStatusCode: input.anomalyStatusCode,
    anomalyModel: input.anomalyModel,
    anomalyPlatform: input.anomalyPlatform,
    anomalyRequestCount: input.anomalyRequestCount,
    anomalyFailureCount: input.anomalyFailureCount,
    anomalyConsecutiveFailures: input.anomalyConsecutiveFailures,
    anomalyLastOccurredAt:
      input.anomalyLastOccurredAt?.toISOString() ?? null
  };
}

function isServiceAnomalyTask(input: {
  triggerKey: string;
  title: string;
}): boolean {
  return (
    input.triggerKey.startsWith("F:") ||
    input.triggerKey.includes("service-anomaly") ||
    input.title.includes("服务异常") ||
    input.title.includes("用户遇到异常")
  );
}

function presentationFromSnapshot(
  snapshot: unknown
): ServiceAnomalyPresentation | null {
  const parsed = serviceAnomalySnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    return null;
  }
  return presentServiceAnomaly({
    anomalyActive: true,
    ...parsed.data,
    anomalyLastOccurredAt: parsed.data.anomalyLastOccurredAt
      ? new Date(parsed.data.anomalyLastOccurredAt)
      : null
  });
}

export function presentTaskServiceAnomaly(input: {
  triggerKey: string;
  title: string;
  anomalySnapshot: unknown;
  user: ServiceAnomalyPresentationInput;
}): ServiceAnomalyPresentation | null {
  if (!isServiceAnomalyTask(input)) {
    return null;
  }

  const snapshotPresentation = presentationFromSnapshot(
    input.anomalySnapshot
  );
  if (snapshotPresentation) {
    return snapshotPresentation;
  }

  const currentPresentation = presentServiceAnomaly(input.user);
  if (currentPresentation) {
    return currentPresentation;
  }

  return presentServiceAnomaly({
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
    anomalyConsecutiveFailures: null,
    anomalyLastOccurredAt: null
  });
}
