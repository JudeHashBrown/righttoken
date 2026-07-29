import {
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function tsxFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = path.join(directory, entry);
    return statSync(filePath).isDirectory()
      ? tsxFiles(filePath)
      : filePath.endsWith(".tsx")
        ? [filePath]
        : [];
  });
}

const forbiddenVisiblePatterns = [
  {
    name: "数据库实现说明",
    pattern: /基于数据库中的最新用户事实|PostgreSQL 数据库/u
  },
  {
    name: "接口实现说明",
    pattern: /后台与任务 API|等待正式账号或接口信息/u
  },
  {
    name: "原始事件或错误码",
    pattern:
      /title:\s*event\.eventType|event\.errorCode\s*\|\||RightToken 事件已应用/u
  },
  {
    name: "规则引擎术语",
    pattern: /全量重算|规则版本|<span>字段<\/span>/u
  },
  {
    name: "内部用户模型名称",
    pattern: /用户 360/u
  },
  {
    name: "原始运行状态",
    pattern: /全量重算：\{runProgress\.status\}/u
  },
  {
    name: "技术配置名称",
    pattern:
      /SMTP 主机|IMAP 主机|\bWebhook\b|\bUserID\b|\bCorpID\b|\bAgentID\b|应用 Secret/u
  },
  {
    name: "服务端实现语言",
    pattern: /服务端|后续审计|用户 360|业务事实/u
  },
  {
    name: "原始异常信息",
    pattern:
      /result\?\.error\?\.message|caught instanceof Error\s*\?\s*caught\.message/u
  }
] as const;

describe("user-facing copy boundary", () => {
  it("does not expose backend implementation language in React surfaces", () => {
    const roots = [
      path.join(process.cwd(), "src/app"),
      path.join(process.cwd(), "src/components")
    ];
    const failures = roots.flatMap((root) =>
      tsxFiles(root).flatMap((filePath) => {
        const source = readFileSync(filePath, "utf8");
        return forbiddenVisiblePatterns
          .filter(({ pattern }) => pattern.test(source))
          .map(
            ({ name }) =>
              `${path.relative(process.cwd(), filePath)}: ${name}`
          );
      })
    );

    expect(failures).toEqual([]);
  });
});
