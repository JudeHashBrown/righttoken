# RightToken 用户召回管理后台

该目录保存独立的用户跟踪、A–G 自动分组、运营任务、地区分配与召回管理后台。当前作为 RightToken 主仓库中的隔离应用维护，后续可接入现有网站登录态和正式用户数据接口。

## 当前能力

- 用户事件与 A–G 自动分组
- 注册两小时未支付等任务触发规则
- 地区与负载分配规则
- PostgreSQL 持久化任务队列
- 运营驾驶舱、优先任务、分组分布与团队负载
- 主管理员、管理员和运营人员权限模型
- CSV 导入/导出、邮件和企微接口的扩展边界

## 本地运行

运行环境固定为 Node.js 24.18 LTS 和 PostgreSQL 16。

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

默认开发地址为 `http://127.0.0.1:3000/dashboard`。

## 验证

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

详细设计与实施计划位于：

- `docs/superpowers/specs/2026-07-23-righttoken-recall-admin-design.md`
- `docs/superpowers/plans/2026-07-23-righttoken-recall-admin-implementation.md`

## 安全说明

- `.env`、生产凭据、真实用户数据和本地构建产物不会进入版本库。
- 当前提交只包含模拟数据和 `example.test` 测试地址。
- 正式接入前需将 RightToken 登录身份和用户事件通过既定适配接口连接。
