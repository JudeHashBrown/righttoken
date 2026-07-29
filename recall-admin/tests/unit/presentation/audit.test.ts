import { describe, expect, it } from "vitest";
import {
  presentAuditAction,
  presentAuditEntity
} from "@/modules/presentation/audit";

describe("audit presentation", () => {
  it("translates common audit entries", () => {
    expect(presentAuditAction("member.access_granted")).toBe(
      "添加成员权限"
    );
    expect(presentAuditAction("segment_rule.published")).toBe(
      "保存分组方案"
    );
    expect(presentAuditEntity("AutomationRuleVersion")).toBe(
      "用户分组"
    );
    expect(presentAuditEntity("MailMessage")).toBe("邮件");
  });

  it("never exposes unknown audit codes", () => {
    expect(presentAuditAction("database.schema_migrated")).toBe(
      "完成一项管理操作"
    );
    expect(presentAuditEntity("InternalQueueRecord")).toBe(
      "运营后台"
    );
  });
});
