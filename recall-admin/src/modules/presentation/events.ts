type UserEventPresentationInput = {
  eventType: string;
  applied: boolean;
  errorCode: string | null;
};

type UserEventPresentation = {
  title: string;
  detail: string;
};

const eventCopy: Record<
  string,
  { title: string; appliedDetail: string }
> = {
  "user.registered": {
    title: "完成注册",
    appliedDetail: "用户资料已更新"
  },
  "checkout.started": {
    title: "开始支付",
    appliedDetail: "用户已进入支付流程"
  },
  "checkout.cancelled": {
    title: "取消支付",
    appliedDetail: "支付进度已更新"
  },
  "checkout.expired": {
    title: "支付未完成",
    appliedDetail: "本次支付已结束"
  },
  "payment.failed": {
    title: "支付失败",
    appliedDetail: "支付进度已更新"
  },
  "payment.succeeded": {
    title: "支付成功",
    appliedDetail: "支付与余额信息已更新"
  },
  "balance.changed": {
    title: "余额发生变化",
    appliedDetail: "当前余额已更新"
  },
  "api_call.succeeded": {
    title: "调用成功",
    appliedDetail: "最近使用情况已更新"
  },
  "service.anomaly": {
    title: "连续调用失败",
    appliedDetail: "已标记为需要优先跟进"
  },
  "service.recovered": {
    title: "调用恢复正常",
    appliedDetail: "用户异常状态已解除"
  },
  "complaint.created": {
    title: "用户提出问题",
    appliedDetail: "已记录用户反馈"
  },
  "refund.requested": {
    title: "用户申请退款",
    appliedDetail: "退款申请已记录"
  },
  "user.profile_updated": {
    title: "用户资料发生变化",
    appliedDetail: "用户资料已更新"
  }
};

export function presentUserEvent(
  input: UserEventPresentationInput
): UserEventPresentation {
  const presentation = eventCopy[input.eventType] ?? {
    title: "用户信息发生变化",
    appliedDetail: "用户资料已更新"
  };
  return {
    title: presentation.title,
    detail: input.applied
      ? presentation.appliedDetail
      : "这条动态未改变用户当前状态"
  };
}
