const replacements: Array<[RegExp, string]> = [
  [/^RightToken user reconciliation:\s*/u, "自动重新分组："],
  [/^manual override:\s*/u, "人工调整："],
  [/^active service anomaly$/u, "近期连续调用失败，需要优先跟进"],
  [/^checkout started without first payment$/u, "已开始支付，但尚未完成首单"],
  [/^registered without checkout or first payment$/u, "已注册，尚未开始支付"],
  [/^paid without successful call$/u, "已完成支付，尚无成功调用"],
  [/^balance exhausted$/u, "余额不足，需要跟进续费"],
  [/^inactive with positive balance$/u, "账户仍有余额，但已较长时间未使用"],
  [/^healthy active user$/u, "用户当前使用正常"],
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
