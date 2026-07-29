const replacements: Array<[RegExp, string]> = [
  [/^claimed$/u, "负责人已领取"],
  [/^没有规则命中；进入公共池$/u, "暂未找到合适负责人，已放入公共任务池"],
  [/^没有规则命中；转交系统默认负责人$/u, "已交由主管理员暂时负责"],
  [/规则“([^”]+)”命中：/gu, "根据“$1”分配："],
  [/负责人当前未完成任务/gu, "负责人当前有"],
  [/备用负责人当前未完成任务/gu, "备用负责人当前有"],
  [/(\d+\/(?:\d+|不限))(?!\s*项待办任务)/gu, "$1 项待办任务"],
  [/；规则负责人当前不可用/gu, "；原负责人当前无法接手"],
  [/；主负责人不可用，转交备用负责人/gu, "；已转交备用负责人"],
  [/；转交系统默认负责人/gu, "；已交由主管理员暂时负责"],
  [/；进入公共池/gu, "；已放入公共任务池"]
];

export function presentAssignmentReason(
  reason: string | null
): string {
  if (!reason?.trim()) {
    return "等待安排负责人";
  }
  const copy = replacements.reduce(
    (result, [pattern, replacement]) =>
      result.replace(pattern, replacement),
    reason.trim()
  );
  if (/^[A-Z][A-Z0-9_.-]+$/u.test(copy)) {
    return "系统已根据当前分配设置安排负责人";
  }
  return copy;
}
