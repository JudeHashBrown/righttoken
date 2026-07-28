export type ReconciliationSchedule = {
  cron: string;
  data: { mode: "incremental" | "full" };
  key: string;
  timezone: "Asia/Shanghai";
};

export function reconciliationSchedules(input: {
  enabled: boolean;
  intervalMinutes: number;
  fullCron: string;
}): ReconciliationSchedule[] {
  if (!input.enabled) {
    return [];
  }
  const interval = Math.max(
    1,
    Math.min(59, Math.trunc(input.intervalMinutes))
  );
  return [
    {
      cron: `*/${interval} * * * *`,
      data: { mode: "incremental" },
      key: `righttoken-incremental-${interval}-minutes`,
      timezone: "Asia/Shanghai"
    },
    {
      cron: input.fullCron,
      data: { mode: "full" },
      key: "righttoken-full-daily",
      timezone: "Asia/Shanghai"
    }
  ];
}
