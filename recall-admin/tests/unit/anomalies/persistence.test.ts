import { describe, expect, it } from "vitest";

import { clearedServiceAnomalyFields } from "@/modules/anomalies/persistence";

describe("clearedServiceAnomalyFields", () => {
  it("clears every persisted current-anomaly field", () => {
    expect(clearedServiceAnomalyFields).toEqual({
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
  });
});
