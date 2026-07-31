const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function toShanghaiVisitDate(occurredAt: Date): Date {
  const parts = Object.fromEntries(
    shanghaiDateFormatter
      .formatToParts(occurredAt)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day)
    )
  );
}
