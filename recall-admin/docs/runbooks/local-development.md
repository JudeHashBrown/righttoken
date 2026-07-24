# 本地开发运行手册

## 必需服务

使用 Node.js 24、PostgreSQL 16，并分别运行数据库迁移、Web 和 Worker：

```bash
npm run db:deploy
npm run worker
APP_URL=http://127.0.0.1:3101 npm run dev -- --hostname 127.0.0.1 --port 3101
```

打开 `http://127.0.0.1:3101`。规则预览只需要 Web 和数据库；发布后的
全量重算需要 Worker 持续运行。

## 分组规则验证

1. 在“分组规则”中展开目标组，修改注释、条件或任务策略。
2. 点击“预览并发布”，核对迁移、重叠和任务影响。
3. 填写变更说明并确认发布。
4. 等待页面进度进入“已完成”或“部分失败”。
5. 在历史版本中检查结果；失败可重试，历史版本可回滚为新版本。

分组代码固定为 A–G。F 始终第一并立即创建紧急任务，G 始终最后且
不创建个人任务。A–E 可调整顺序。

## RightToken 字段

余额条件比较 `balanceUsdMinor`。同时保存 `balanceMinor` 和
`balanceCurrency`，但本服务不换算汇率。`countryCode` 是 RightToken
根据注册 IP 提供的 ISO 国家代码。注册 IP 为加密敏感字段。

## 验证命令

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run worker:build
npm run build
npm run test:e2e
```
