const replacements: Array<[RegExp, string]> = [
  [/^RightToken user reconciliation:\s*/u, "自动重新分组："],
  [/首次支付时间不为空/gu, "已完成首单"],
  [/首次支付时间为空/gu, "尚未完成首单"],
  [/是否进入支付等于 (?:是|true)/gu, "已进入支付流程"],
  [/是否进入支付等于 (?:否|false)/gu, "未进入支付流程"],
  [/是否存在服务异常等于 (?:是|true)/gu, "存在服务异常"],
  [/是否存在服务异常等于 (?:否|false)/gu, "没有服务异常"],
  [/成功调用次数等于 0/gu, "尚无成功调用"],
  [/成功调用次数大于 0/gu, "已有成功调用"],
  [/美元等值余额（美分）大于等于 50/gu, "余额不少于 0.50 美元"],
  [/美元等值余额（美分）小于 50/gu, "余额低于 0.50 美元"],
  [/距离最后调用时间大于等于 7 天/gu, "超过 7 天未调用"]
];

export function presentSegmentReason(reason: string): string {
  return replacements.reduce(
    (copy, [pattern, replacement]) => copy.replace(pattern, replacement),
    reason
  );
}
