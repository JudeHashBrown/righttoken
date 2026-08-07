const HOUR_MS = 60 * 60 * 1_000;

export function dashboardTaskWindows(now: Date): {
  dueTodayCreatedAfter: Date;
  urgentCreatedAfter: Date;
} {
  return {
    dueTodayCreatedAfter: new Date(
      now.getTime() - 168 * HOUR_MS
    ),
    urgentCreatedAfter: new Date(
      now.getTime() - 72 * HOUR_MS
    )
  };
}
