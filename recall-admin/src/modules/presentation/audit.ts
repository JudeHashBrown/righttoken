const actionCopy: Record<string, string> = {
  "member.access_granted": "添加成员权限",
  "member.access_revoked": "撤销成员权限",
  "member.wecom_mapping_updated": "更新成员企业微信账号",
  "primary_admin.transferred": "更换主管理员",
  "assignment_rules.published": "保存客户分配方案",
  "location_rules.published": "保存邮箱来源判断",
  "automation_rule.published": "保存自动化设置",
  "segment_rule.previewed": "预览分组方案",
  "segment_rule.published": "保存分组方案",
  "segment_rule.rolled_back": "恢复历史分组方案",
  "segment_recalculation.retried": "重新整理未完成用户",
  "segment_override.created": "设置临时分组",
  "segment_override.revoked": "取消临时分组",
  "task.created": "创建跟进任务",
  "task.assigned": "分配跟进任务",
  "task.claimed": "领取跟进任务",
  "task.transferred": "转派跟进任务",
  "task.cancelled": "取消跟进任务",
  "task.auto_cancelled": "结束不再需要的任务",
  "task.waiting_user": "等待用户回复",
  "task.user_replied": "收到用户回复",
  "mail.reviewed_sent": "发送邮件",
  "mail.thread_replied": "回复用户邮件",
  "mail.inbound_assigned": "关联用户来信",
  "mailbox.credential_saved": "保存客服邮箱",
  "integration.credential_saved": "保存通知连接",
  "users.export_csv": "导出用户名单",
  "user_note.created": "添加用户备注"
};

const entityCopy: Record<string, string> = {
  Member: "成员与权限",
  MemberWecomMapping: "成员企业微信账号",
  AssignmentRule: "客户分配",
  LocationAttributionRule: "用户来源判断",
  AutomationRuleVersion: "用户分组",
  SegmentRecalculationRun: "用户分组",
  SegmentOverride: "用户分组",
  Task: "跟进任务",
  MailMessage: "邮件",
  Mailbox: "客服邮箱",
  IntegrationCredential: "通知连接",
  UserProfile: "用户"
};

export function presentAuditAction(action: string): string {
  return actionCopy[action] ?? "完成一项管理操作";
}

export function presentAuditEntity(entityType: string): string {
  return entityCopy[entityType] ?? "运营后台";
}
