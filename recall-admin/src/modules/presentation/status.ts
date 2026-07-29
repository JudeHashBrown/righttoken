const taskStatusCopy: Record<string, string> = {
  UNASSIGNED: "待领取",
  TODO: "待处理",
  IN_PROGRESS: "处理中",
  WAITING_USER: "等待用户",
  COMPLETED: "已完成",
  PAUSED: "已暂停",
  CANCELLED: "已取消"
};

const runStatusCopy: Record<string, string> = {
  PENDING: "等待开始",
  QUEUED: "等待开始",
  RUNNING: "正在整理用户分组",
  COMPLETED: "整理完成",
  PARTIAL_FAILURE: "部分用户尚未完成",
  FAILED: "未能完成"
};

const taskPriorityCopy: Record<string, string> = {
  URGENT: "紧急",
  IMPORTANT: "重要",
  NORMAL: "普通"
};

const taskOriginCopy: Record<string, string> = {
  AUTOMATION: "系统发现",
  MANUAL: "人工创建",
  EMAIL_REPLY: "用户来信"
};

export function presentTaskStatus(status: string): string {
  return taskStatusCopy[status] ?? "状态正在更新";
}

export function presentRunStatus(status: string): string {
  return runStatusCopy[status] ?? "进度正在更新";
}

export function presentTaskPriority(priority: string): string {
  return taskPriorityCopy[priority] ?? "普通";
}

export function presentTaskOrigin(origin: string): string {
  return taskOriginCopy[origin] ?? "运营工作";
}
