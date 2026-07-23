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
- RightToken 内部事件接口
- 邮件和企业微信渠道扩展边界

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
