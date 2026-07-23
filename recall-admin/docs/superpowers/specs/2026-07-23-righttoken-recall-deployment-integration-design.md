# RightToken 召回后台部署与主站集成设计

## 1. 目标

将 `recall-admin/` 作为 RightToken 主仓库中的独立子应用持续开发，并使其在功能完成后可以直接进入测试和生产发布流程。

首发部署地址为 `https://recall.righttoken.ai`。RightToken 主站仍由现有 Go 后端与 Vite 前端提供，召回后台不重写进主站技术栈，而是通过统一入口、身份适配器和内部数据接口完成集成。

本阶段交付可重复使用的本地、测试和生产环境配置，不执行正式 DNS 修改，不写入真实生产密钥，也不直接更新正式服务器。

## 2. 已确认的架构决策

1. RightToken `main` 保持正式主线，召回功能在 `codex/righttoken-user-recall-admin` 分支开发。
2. `recall-admin/` 保持独立 Next.js 应用，避免重写现有业务模块。
3. Web 和 Worker 使用同一份镜像、不同启动命令。
4. 召回系统使用独立 PostgreSQL 16 数据库，不与 RightToken 主库共用表或迁移历史。
5. 两套系统通过内部事件接口和定时校准接口交换业务事实。
6. 首发保留独立运营账号；身份模式通过环境变量切换，后续可接入 RightToken 单点登录。
7. Caddy 统一管理 HTTPS，将 `recall.righttoken.ai` 转发给召回 Web 容器。
8. 生产容器不直接向公网暴露 PostgreSQL 或 Worker 端口。

## 3. 仓库结构

保留现有目录，并新增部署与自动化文件：

```text
righttoken/
├── backend/
├── frontend/
├── deploy/
│   ├── docker-compose.yml
│   ├── docker-compose.recall.yml
│   ├── Caddyfile
│   └── recall.env.example
├── recall-admin/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── compose.yaml
│   ├── src/
│   ├── prisma/
│   └── scripts/
└── .github/workflows/
    └── recall-admin-ci.yml
```

`recall-admin/compose.yaml` 用于开发者单独启动召回模块。`deploy/docker-compose.recall.yml` 是生产覆盖文件，与 RightToken 现有 `deploy/docker-compose.yml` 组合使用。

## 4. 运行组件

### 4.1 recall-web

- 运行 Next.js standalone 产物。
- 只在 Docker 内部监听 `3000`。
- 提供管理页面、API、健康检查和就绪检查。
- 依赖 `recall-db` 完成数据库迁移后启动。
- 不保存本地持久化文件。

### 4.2 recall-worker

- 与 `recall-web` 使用同一镜像。
- 使用 `npm run worker` 启动 pg-boss 消费进程。
- 处理延时分组检查、任务提醒、邮件同步、事件重试和数据校准。
- 不暴露网络端口。
- 使用独立健康状态检查确认 Worker 仍能访问数据库并正常消费任务。

### 4.3 recall-db

- 固定使用 PostgreSQL 16。
- 数据写入独立命名卷 `recall_postgres_data`。
- 数据库名称默认 `righttoken_recall`，用户默认 `righttoken_recall`。
- 仅加入内部 Docker 网络，不映射宿主机公网端口。
- 本地开发可通过回环地址 `127.0.0.1:55432` 访问。

### 4.4 recall-migrate

- 使用召回应用镜像执行 `prisma migrate deploy`。
- 作为一次性任务运行，成功后 Web 和 Worker 才能启动。
- 迁移失败时发布整体失败，旧版本容器保持可回滚。

## 5. Docker 网络与入口

RightToken 现有服务继续使用 `sub2api-network`。召回覆盖文件加入以下网络：

- `sub2api-network`：允许 RightToken 后端向召回内部事件接口发送事件。
- `recall-network`：只连接 `recall-web`、`recall-worker` 和 `recall-db`。

`recall-db` 只加入 `recall-network`。RightToken 主服务不能直接读写召回表；召回服务也不获取 RightToken 主数据库写权限。

Caddy 新增独立站点：

```caddy
recall.righttoken.ai {
    encode zstd gzip
    reverse_proxy recall-web:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}
```

生产环境由 Caddy 自动申请和续期 TLS 证书。本地开发继续使用 `http://127.0.0.1:3000`，无需本地证书。

## 6. 环境分层

### 6.1 文件规则

- `recall-admin/.env.example`：单独开发召回模块的非敏感示例。
- `deploy/recall.env.example`：完整生产变量清单和说明。
- `.env`、`*.env.local`、`deploy/recall.env`：始终忽略，不进入 Git。
- GitHub Actions 只读取仓库 Secrets 或环境 Secrets。
- 生产服务器只保存 `deploy/recall.env`，权限设为仅部署用户可读。

### 6.2 必填核心变量

| 变量 | 用途 | 本地默认 | 生产要求 |
|---|---|---|---|
| `RECALL_DATABASE_URL` | Web 数据库连接 | 本地 PostgreSQL | 使用 Docker 内部主机名和强密码 |
| `RECALL_JOB_DATABASE_URL` | Worker/pg-boss 连接 | 与主连接相同 | 可与主连接相同，保留独立连接池 |
| `RECALL_POSTGRES_PASSWORD` | 召回数据库密码 | 开发专用值 | 至少 32 个随机字符 |
| `RECALL_SESSION_COOKIE_SECRET` | 会话签名 | 开发专用值 | 至少 32 字节随机值 |
| `RECALL_APP_ENCRYPTION_KEY` | 邮箱等凭据加密 | 开发专用值 | Base64 编码的 32 字节密钥 |
| `RECALL_APP_URL` | 外部访问地址 | `http://127.0.0.1:3000` | `https://recall.righttoken.ai` |
| `RECALL_AUTH_MODE` | 身份模式 | `standalone` | 首发为 `standalone` |
| `RECALL_INTERNAL_API_SECRET` | 主站事件接口鉴权 | 开发专用值 | 至少 32 字节随机值并定期轮换 |

应用内部继续读取现有变量名 `DATABASE_URL`、`JOB_DATABASE_URL`、`SESSION_COOKIE_SECRET`、`APP_ENCRYPTION_KEY` 和 `APP_URL`。Compose 负责从 `RECALL_*` 部署变量映射为应用变量，避免与 RightToken 主服务变量冲突。

### 6.3 身份变量

| 变量 | 说明 |
|---|---|
| `RECALL_AUTH_MODE=standalone` | 使用召回后台独立主管理员、管理员和运营账号 |
| `RECALL_AUTH_MODE=righttoken` | 接受 RightToken 身份适配器建立的会话 |
| `RECALL_RIGHTTOKEN_ISSUER` | RightToken 身份签发方 |
| `RECALL_RIGHTTOKEN_AUDIENCE` | 召回后台身份受众 |
| `RECALL_RIGHTTOKEN_JWKS_URL` | RightToken 公钥地址 |
| `RECALL_RIGHTTOKEN_ROLE_MAP` | RightToken 角色到召回角色的 JSON 映射 |

首发环境只启用 `standalone`。`righttoken` 模式的变量进入示例文件，但未配置完整值时应用必须拒绝启动，不能自动降级成无鉴权模式。

### 6.4 外部渠道变量

邮件与企业微信使用可选变量：

- `RECALL_SMTP_HOST`
- `RECALL_SMTP_PORT`
- `RECALL_SMTP_SECURE`
- `RECALL_SMTP_USER`
- `RECALL_SMTP_PASSWORD`
- `RECALL_IMAP_HOST`
- `RECALL_IMAP_PORT`
- `RECALL_IMAP_SECURE`
- `RECALL_IMAP_USER`
- `RECALL_IMAP_PASSWORD`
- `RECALL_WECHAT_WEBHOOK_URL`
- `RECALL_NOTIFICATION_FROM`

未配置渠道时 Web 和 Worker 可以启动，但对应渠道在后台显示“未配置”，发送动作返回明确错误，不静默丢弃消息。

## 7. RightToken 数据接入

### 7.1 实时事件

RightToken 后端通过 Docker 内部地址向召回服务发送已定义事件：

```text
POST http://recall-web:3000/api/internal/righttoken/events
Authorization: Bearer <RECALL_INTERNAL_API_SECRET>
```

事件继续使用现有 `event_id` 幂等键。接口只接受内部网络请求、固定 Bearer 密钥和受支持的事件类型。日志不记录完整邮箱、IP、令牌或请求正文。

首批事件包括注册、支付流程、支付结果、余额、成功调用、服务异常、投诉、退款和资料更新。

### 7.2 定时校准

召回 Worker 通过 RightToken 内部只读 API 分页读取用户事实，不直接查询主数据库。校准接口变量为：

- `RECALL_RIGHTTOKEN_API_BASE_URL`
- `RECALL_RIGHTTOKEN_API_TOKEN`
- `RECALL_RECONCILE_INTERVAL_MINUTES`
- `RECALL_FULL_RECONCILE_CRON`

默认每 15 分钟增量校准，每日凌晨执行完整校准。接口暂未提供时，`RECALL_RECONCILE_ENABLED=false`，不会影响其他功能启动。

### 7.3 后台菜单入口

RightToken 现有管理后台增加“用户召回”入口，跳转到 `https://recall.righttoken.ai/dashboard`。在 `standalone` 模式下进入召回登录页；切换到 `righttoken` 模式后由主站签发一次性登录或标准 OIDC 会话。

## 8. 健康检查与启动顺序

召回应用提供：

- `GET /api/health/live`：进程存活即返回 200，不访问外部依赖。
- `GET /api/health/ready`：数据库连接和必要配置均有效时返回 200。

启动顺序：

1. `recall-db` 通过 PostgreSQL 健康检查。
2. `recall-migrate` 完成数据库迁移。
3. `recall-web` 和 `recall-worker` 启动。
4. Caddy 只将流量发给就绪的 `recall-web`。

健康接口不得返回连接串、密钥、账号、内部异常堆栈或用户数据。

## 9. 错误处理与恢复

- 环境变量无效：容器启动失败并指出变量名，不输出变量值。
- 数据库不可用：就绪检查失败，Web 不接收业务流量，Worker 依靠容器重启策略恢复。
- 迁移失败：停止发布，不启动新版本 Web 和 Worker。
- 重复事件：返回成功幂等结果，不重复生成任务。
- RightToken 接口暂时不可用：使用指数退避重试，并在后台标记集成异常。
- 邮件或企微未配置：任务仍保留在后台，渠道状态显示未配置。
- 邮件或企微发送失败：记录脱敏错误，按规则重试，超过上限后通知管理员。
- 回滚应用版本：数据库迁移只允许向前兼容；回滚前必须确认旧版本可读取新结构。

## 10. 安全要求

1. 生产环境不允许无鉴权模式。
2. 会话 Cookie 使用 `HttpOnly`、`Secure` 和 `SameSite=Lax`。
3. 主站事件密钥和数据库密码分离。
4. 内部 API 密钥支持双密钥轮换窗口。
5. CSV 导出继续仅允许主管理员。
6. PostgreSQL、Worker 和迁移任务不公开端口。
7. 容器使用非 root 用户运行，根文件系统尽可能只读。
8. 镜像不包含 `.env`、测试数据、Git 历史或本地缓存。
9. CI 执行依赖审计，但不把凭据注入普通拉取请求。
10. 日志采用结构化格式并对邮箱、IP、Token 和用户输入脱敏。

## 11. CI 与发布流程

新增 `recall-admin-ci.yml`，在 `recall-admin/**` 或召回部署文件变化时执行：

1. 使用 Node.js 24.18。
2. `npm ci`。
3. 单元测试。
4. 类型检查。
5. ESLint。
6. Next.js production build。
7. Docker 镜像构建。
8. Compose 配置解析。

发布镜像使用 Git 提交 SHA 标记，不能只依赖 `latest`。生产发布顺序为：

1. 拉取指定 SHA 镜像。
2. 备份召回数据库。
3. 执行迁移任务。
4. 启动新 Web 和 Worker。
5. 检查就绪接口和核心页面。
6. 更新 Caddy 流量。
7. 保留上一版本镜像用于快速回滚。

首轮配置工作只验证本地镜像和 Compose，不推送生产镜像，也不操作线上服务器。

## 12. 备份与数据保留

- 每日生成一次 PostgreSQL 逻辑备份。
- 默认保留最近 14 天日备份和最近 8 周周备份。
- 备份文件在服务器侧加密，访问权限与生产密钥分离。
- 每月至少执行一次恢复演练。
- 删除运营账号不能级联删除任务、审计记录或用户时间线。
- 用户删除和隐私请求通过独立的脱敏流程处理，不直接删除审计事实。

## 13. 本地与测试验收

完成环境配置后必须满足：

1. 一条命令可启动召回数据库、迁移、Web 和 Worker。
2. `http://127.0.0.1:3000/api/health/live` 返回 200。
3. `http://127.0.0.1:3000/api/health/ready` 返回 200。
4. 主管理员能够登录并访问 Dashboard。
5. 普通管理员不能导出 CSV，主管理员可以导出。
6. 模拟 `user.registered` 事件只创建一个用户事实。
7. 重放相同 `event_id` 不重复创建任务。
8. 注册两小时未支付的检查能够由 Worker 消费。
9. 未配置邮件与企微时，后台明确显示未配置且任务不丢失。
10. `npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 全部通过。
11. Docker 镜像以非 root 用户启动。
12. Compose 最终配置中没有公开数据库和 Worker 端口。

## 14. 本阶段明确不做

- 不修改 `recall.righttoken.ai` 的正式 DNS。
- 不登录或更新正式服务器。
- 不写入 Namecheap、企业微信或 RightToken 的真实凭据。
- 不把召回表合并进 RightToken 主数据库。
- 不重写召回后台为 Go + Vite。
- 不在首轮启用 `righttoken` 身份模式。
- 不自动合并到 `main`。

## 15. 完成定义

当环境示例、Dockerfile、开发 Compose、生产 Compose 覆盖文件、Caddy 配置、迁移启动顺序、健康检查、CI、发布说明和自动验证全部在 `codex/righttoken-user-recall-admin` 分支通过后，本阶段完成。

完成后，该分支应具备两种用途：

- 开发者可在本机直接启动和测试完整召回服务。
- 运维可在补充真实密钥和 DNS 后，按照发布说明将其部署到 `recall.righttoken.ai`。
