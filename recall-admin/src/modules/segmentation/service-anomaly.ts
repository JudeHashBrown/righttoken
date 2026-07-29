export const maximumServiceAnomalyAgeMs =
  24 * 60 * 60 * 1_000;

export function isCurrentServiceAnomaly(
  anomalyActive: boolean,
  anomalyChangedAt: Date | null,
  now: Date
): boolean {
  if (!anomalyActive || !anomalyChangedAt) {
    return false;
  }
  return (
    Math.max(0, now.getTime() - anomalyChangedAt.getTime()) <
    maximumServiceAnomalyAgeMs
  );
}
