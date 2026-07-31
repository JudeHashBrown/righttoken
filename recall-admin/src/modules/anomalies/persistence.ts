import type { UserProfile } from "@/generated/prisma/client";

type ServiceAnomalyFields = Pick<
  UserProfile,
  | "anomalyErrorPhase"
  | "anomalyErrorType"
  | "anomalyErrorMessage"
  | "anomalyErrorOwner"
  | "anomalyStatusCode"
  | "anomalyModel"
  | "anomalyPlatform"
  | "anomalyRequestCount"
  | "anomalyFailureCount"
  | "anomalyConsecutiveFailures"
  | "anomalyLastOccurredAt"
>;

export const clearedServiceAnomalyFields = {
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
} as const satisfies ServiceAnomalyFields;
