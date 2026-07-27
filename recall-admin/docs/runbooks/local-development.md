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

本地开发不需要账号、密码、验证码或 Cookie。系统会自动使用数据库中
启用的主管理员作为当前操作人；若缺少主管理员，会直接报告初始化错误。
免登录仅在 `AUTH_MODE=development` 与 `DEPLOYMENT_ENV=local` 同时存在时
生效。生产 Compose 把 `DEPLOYMENT_ENV` 固定为 `production`，不能通过
生产环境变量文件开启免登录。

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
`balanceCurrency`，但本服务不换算汇率。`countryCode` 是最终运营归属国家，
`ipCountryCode` 是注册 IP 的原始国家。注册 IP 为加密敏感字段。

## 本地 IP 数据库

将数据库放入 `data/geoip/`，该目录不会进入 Git：

```text
data/geoip/GeoLite2-City.mmdb
data/geoip/delegated-rir.txt
```

直接运行 Web/Worker 时在 `.env` 设置：

```bash
GEOIP_MMDB_PATH=./data/geoip/GeoLite2-City.mmdb
GEOIP_RIR_PATH=./data/geoip/delegated-rir.txt
```

免费 RIR 国家级 IP 地址段可一键更新：

```bash
npm run geoip:update
```

脚本会下载 AFRINIC、APNIC、ARIN、LACNIC 和 RIPE NCC 五份公开数据，
全部校验成功后再原子替换旧快照；任一来源失败时保留现有文件。

未放置本地数据库时注册仍会继续；开发环境可以通过事件中的国家字段进行
兜底。邮箱归属规则仍会正常生效。

## 企业微信通知验证

本地测试不需要真实企业微信账号。自动化测试会模拟访问令牌、应用消息和
群机器人接口：

```bash
npx vitest run tests/unit/notifications \
  tests/unit/worker/notification-delivery.test.ts \
  tests/integration/notifications
```

需要测试真实连接时，只能在“系统设置”中填写公司内部测试应用和测试群，
并向明确指定的内部测试成员 UserID 发送连接消息。连接消息不得包含真实
用户邮箱、注册 IP 或支付信息。运营成员的 UserID 在“成员与权限”页面配置。

## 验证命令

`npm run test:integration` 不会连接正在供网页使用的开发数据库。它会从
`DATABASE_URL` 派生名称以 `_test` 结尾的独立测试库，运行前清空该测试库，
再执行迁移、加入安全示例数据并运行接口和数据库联调测试。也可以通过
`TEST_DATABASE_URL` 明确指定测试库；脚本会拒绝清空任何名称不以 `_test`
结尾的数据库。

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run worker:build
npm run build
npm run test:e2e
```
