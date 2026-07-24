# RightToken 用户召回管理后台

该目录是 RightToken 主仓库中的独立召回子应用，负责用户事件、A–G 自动分组、运营任务、地区分配和召回管理。正式访问域名规划为 `https://recall.righttoken.ai`。

## 当前能力

- 用户事件与 A–G 自动分组
- 注册两小时未支付等延时任务
- 地区、语言、渠道与负载分配规则
- PostgreSQL 持久化任务队列
- 运营驾驶舱、优先任务、分组分布与团队负载
- 主管理员、管理员和运营人员权限
- 仅主管理员可导出 CSV
- 邮件审核发送、SMTP/IMAP 收信、回复匹配和人工归档
- 企微群机器人脱敏通知、失败重试和死信留痕
- RightToken 实时事件接口、模拟数据源和定时全量校准

## 一键启动本地完整环境

需要 Docker Desktop。首次启动会创建 PostgreSQL、执行迁移、写入安全模拟数据，并启动 Web 和 Worker：

```bash
docker compose --env-file .env.example up --build -d
```

打开 `http://127.0.0.1:3000/login`。

本地测试账号：

```text
账号：primary-admin@example.test
密码：DevelopmentOnlyPassword123!
```

停止服务但保留测试数据库：

```bash
docker compose --env-file .env.example down
```

## 不使用 Docker 开发

固定使用 Node.js 24.18 和 PostgreSQL 16：

```bash
cp .env.example .env
npm ci
npm run db:deploy
npm run db:seed
npm run dev
```

Worker 另开一个终端运行：

```bash
npm run worker
```

开发服务器如果使用 3101 端口，必须同时让同源地址保持一致：

```bash
APP_URL=http://127.0.0.1:3101 npm run dev -- --hostname 127.0.0.1 --port 3101
```

## 集成配置

登录后在“系统设置”中完成配置，密码、Webhook 和接口密钥都会加密保存：

- 客服邮箱：支持 Namecheap Private Email、企业微信邮箱和自定义 SMTP/IMAP。
- 企业微信：保存群机器人 Webhook 后，可先发送一条不含用户信息的测试消息。
- RightToken：正式用户接口未提供前可启用 100 位安全模拟用户；正式接入时切换为 HTTP 模式。

RightToken 实时事件兼容地址：

```text
POST /api/integrations/righttoken/events
POST /api/internal/righttoken/events
```

后台 Worker 每两分钟收取邮件、每分钟投递通知、每十五分钟增量校准用户，并在每天 02:00 执行全量校准。未启用对应连接时任务会安全跳过。

## 验证

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run worker:build
npm run bootstrap:build
npm run build
```

生产部署、密钥、Caddy、备份和回滚步骤见 [deployment.md](docs/deployment.md)。

## 安全说明

- `.env`、生产凭据、真实用户数据、备份和构建产物不会进入版本库。
- 示例数据只使用 `example.test` 地址。
- 首发使用独立运营账号，`AUTH_MODE=standalone`。
- `AUTH_MODE=righttoken` 只预留配置；身份适配器完成前不得在生产启用。
- 正式接入通过内部事件 API 和只读校准 API，不直接读写 RightToken 主数据库。
