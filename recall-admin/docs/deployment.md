# RightToken 召回后台部署手册

## 1. 发布边界

- 代码目录：`recall-admin/`
- 生产域名：`https://recall.righttoken.ai`
- 生产服务：`recall-web`、`recall-worker`、`recall-db`
- 一次性任务：`recall-migrate`、`recall-bootstrap`
- 生产身份模式：`righttoken`
- 数据库：独立 PostgreSQL 16，不与 RightToken 主库共表

本手册中的生产操作只在确认服务器、DNS 和密钥后执行。普通开发和 CI 不接触正式环境。

## 2. 服务器文件

在 RightToken 现有部署目录保留：

```text
deploy/
├── .env
├── recall.env
├── docker-compose.yml
├── docker-compose.recall.yml
└── Caddyfile.recall
```

`deploy/.env` 继续保存 RightToken 主服务变量。复制召回示例：

```bash
cp deploy/recall.env.example deploy/recall.env
chmod 600 deploy/recall.env
```

`recall.env` 不得提交到 Git。

## 3. 生成生产密钥

分别生成，不要复用：

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 32
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

依次用于：

1. `RECALL_POSTGRES_PASSWORD`
2. `RECALL_SESSION_COOKIE_SECRET`
3. `RECALL_APP_ENCRYPTION_KEY`
4. `RECALL_INTERNAL_API_SECRET_CURRENT`
5. `RECALL_RIGHTTOKEN_SSO_SECRET`
6. 主站 `RECALL_EXPORT_SECRET`

主站和召回服务只共享对应用途的值：

| 用途 | RightToken 主站 `.env` | 召回 `recall.env` |
| --- | --- | --- |
| 只读用户同步 | `RECALL_EXPORT_SECRET` | `RECALL_RIGHTTOKEN_API_TOKEN` |
| 召回访问校验 | `RECALL_SSO_INTERNAL_SECRET` | `RECALL_INTERNAL_API_SECRET_CURRENT` |
| 60 秒 SSO 票据 | `RECALL_SSO_SSO_SECRET` | `RECALL_RIGHTTOKEN_SSO_SECRET` |

同时设置：

```text
RECALL_SSO_BASE_URL=https://recall.righttoken.ai
RECALL_SSO_ISSUER=https://righttoken.ai
RECALL_SSO_AUDIENCE=righttoken-recall
RECALL_RIGHTTOKEN_API_BASE_URL=https://righttoken.ai
RECALL_RIGHTTOKEN_ADMIN_URL=https://righttoken.ai/user-operations
```

默认读取路径为 `/api/v1/admin/recall/users`。这个密钥不得复用 JWT、
管理员 API Key、数据库密码或 `RECALL_INTERNAL_API_SECRET_CURRENT`。
首次正式联调最多读取 5 名用户，响应不得重定向到文件；真实邮箱和 IP
不得进入测试夹具、部署笔记、日志、截图或 GitHub。

数据库密码写入 `RECALL_DATABASE_URL` 和 `RECALL_JOB_DATABASE_URL` 时必须进行 URL 编码。生产镜像使用不可变 Git SHA，例如：

```text
RECALL_IMAGE=ghcr.io/judehashbrown/righttoken-recall:817e28f0
```

不得只使用 `latest`。

## 4. 首次主管理员

在 `recall.env` 临时填写：

```text
RECALL_BOOTSTRAP_PRIMARY_ADMIN_EMAIL=your-admin@company.example
RECALL_BOOTSTRAP_PRIMARY_ADMIN_NAME=主管理员
```

运行一次：

```bash
cd deploy
docker compose \
  --env-file .env \
  --env-file recall.env \
  -f docker-compose.yml \
  -f docker-compose.recall.yml \
  --profile recall-bootstrap \
  run --rm recall-bootstrap
```

成功后立即清空 `recall.env` 中的临时主管理员邮箱。重复执行同一邮箱只更新
该账号；如果数据库已经存在其他主管理员，命令会拒绝替换。该邮箱必须与
RightToken 主站账号邮箱一致；首次 SSO 成功后会绑定稳定的主站用户 ID。

## 5. 启动顺序

先拉取指定 SHA 镜像：

```bash
docker pull ghcr.io/judehashbrown/righttoken-recall:YOUR_GIT_SHA
```

解析配置：

```bash
cd deploy
docker compose \
  --env-file .env \
  --env-file recall.env \
  -f docker-compose.yml \
  -f docker-compose.recall.yml \
  config --quiet
```

启动召回栈：

```bash
docker compose \
  --env-file .env \
  --env-file recall.env \
  -f docker-compose.yml \
  -f docker-compose.recall.yml \
  up -d recall-db recall-migrate recall-web recall-worker
```

迁移失败时 Web 和 Worker 不会进入服务状态。

## 6. 健康检查

服务器本机验证：

```bash
curl --fail http://127.0.0.1:3000/api/health/live
curl --fail http://127.0.0.1:3000/api/health/ready
```

检查容器：

```bash
docker compose \
  --env-file deploy/.env \
  --env-file deploy/recall.env \
  -f deploy/docker-compose.yml \
  -f deploy/docker-compose.recall.yml \
  ps
```

预期：

- `recall-db` 健康。
- `recall-web` 健康。
- `recall-worker` 健康。
- `recall-migrate` 退出码为 0。
- 召回数据库和 Worker 没有宿主机公开端口。

## 7. Caddy 和域名

DNS 中将 `recall.righttoken.ai` 的 A/AAAA 记录指向 RightToken 服务器。正式变更前先确认 80/443 端口、Cloudflare 模式和证书策略。

将以下内容加入主 Caddyfile：

```caddy
import /opt/righttoken/deploy/Caddyfile.recall
```

验证并重新加载：

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy 只访问 `127.0.0.1:3000`，数据库和 Worker 不经过公网。

## 8. RightToken 事件测试

仅使用模拟用户：

```bash
curl --fail \
  -H 'Authorization: Bearer REPLACE_WITH_TEST_INTERNAL_SECRET' \
  -H 'Content-Type: application/json' \
  --data '{
    "event_id": "deploy-smoke-registration-001",
    "event_type": "user.registered",
    "occurred_at": "2026-07-23T12:00:00.000Z",
    "user_id": "deploy-smoke-user-001",
    "payload": {
      "email": "deploy-smoke-user-001@example.test",
      "country_code": "SG"
    }
  }' \
  https://recall.righttoken.ai/api/integrations/righttoken/events
```

第一次应返回 `duplicate: false`，再次提交同一 `event_id` 应返回 `duplicate: true`。

主站正式发送事件时使用 Docker 内部地址：

```text
http://recall-web:3000/api/integrations/righttoken/events
```

内部密钥轮换时先设置 `RECALL_INTERNAL_API_SECRET_PREVIOUS`，确认主站已经切换到新密钥后再清空上一密钥。

旧地址 `/api/internal/righttoken/events` 继续保留，便于 RightToken 主站平滑迁移。

## 9. 首次真实用户校准

先按顺序执行主站迁移 `109_add_user_registration_ip.sql` 和
`110_recall_export_indexes_notx.sql`。第二个迁移为召回增量导出补充索引，
使用非事务方式创建，避免长时间阻塞线上表。随后可在主站数据库以只读方式
运行以下核验，不输出真实邮箱和 IP：

```bash
psql "$RIGHTTOKEN_DATABASE_URL" \
  -f backend/scripts/verify-recall-users.sql
```

随后先用 `limit=5` 调用只读接口，仅在受控终端检查响应，不保存到文件：

```bash
curl --fail --silent \
  -H "Authorization: Bearer $RECALL_EXPORT_SECRET" \
  "https://righttoken.ai/api/v1/admin/recall/users?limit=5"
```

在真实数据副本上发布前，可运行数据库契约测试。该测试会自动应用主站迁移，
写入并清理虚构用户，核对注册 IP、支付退款、金额单位、余额、成功调用数和
异常状态，不读取或输出真实邮箱与 IP：

```bash
cd backend
RECALL_CONTRACT_DATABASE_URL="$RIGHTTOKEN_DATABASE_COPY_URL" \
  go test -tags=recallcontract ./internal/handler/admin \
  -run TestRecallUserExportAgainstMigratedPostgres -count=1
```

同一契约测试已经加入 `Recall Admin CI`，后续主站表结构或召回查询发生变化时
会阻止不兼容版本生成生产镜像。

接口口径：

- `checkoutStartedAt`：用户创建第一笔支付订单的时间，即进入订单/结账流程；
  不代表已打开第三方收银台。
- `successfulCallCount`：`usage_logs` 成功计费账本行数；失败请求来自
  `ops_error_logs`，不会计入。
- `totalPaidMinor`：扣除退款后按主站固定 7 CNY/USD 口径归一化的美元美分。
- `balanceMinor`、`balanceUsdMinor`：用户当前美元余额的美分。
- `anomalyActive`：尚未解决、非业务限流的 P0/P1 错误。

首次全量导入：

```bash
cd deploy
docker compose \
  --env-file .env \
  --env-file recall.env \
  -f docker-compose.yml \
  -f docker-compose.recall.yml \
  run --rm recall-worker npm run sync:initial:prod
```

命令只输出数量汇总。确认 `complete=true`、
`sourceUsersScanned=destinationUsersAfter`；如果召回库原先已有数据，则核对
`destinationUsersAfter` 与主站有效用户总数一致。导入过程已同步执行邮箱/IP
地区识别、地区负责人分配和 A–G 分组，并把到期任务加入 Worker 队列。

确认以下生产值：

```text
RECALL_RECONCILE_ENABLED=true
RECALL_RECONCILE_INTERVAL_MINUTES=15
RECALL_FULL_RECONCILE_CRON=0 2 * * *
```

增量同步最多延迟约 15 分钟；每天北京时间 02:00 进行全量校准。

## 10. 邮箱、企微与用户校准

部署完成后由主管理员进入“系统设置”保存连接信息，不要把邮箱密码、企微 Secret、企微 Webhook 或 RightToken API Token 写入镜像：

1. 保存客服邮箱并执行“测试连接”和“立即同步”。
2. 保存企业微信应用的 CorpID、AgentID 和 Secret，并向明确指定的内部测试成员发送不含用户信息的测试消息。
3. 在“成员与权限”中为运营成员填写企业微信 UserID。
4. 保存企微群机器人并向内部测试群发送不含用户信息的测试消息。
5. 首次先使用 RightToken 模拟模式验证任务、分组和通知路由，再切换正式 HTTP 接口。
6. 正式切换后执行一次全量校准，确认统计结果和抽样用户。

普通和重要任务通过企业微信应用直发当前负责人。F 组、服务异常和严重
超时同时发送运营群。负责人未映射企微 UserID 时，系统会通知主管理员并
发送运营群。外部通知只包含用户编号、地区、分组、触发原因、时限和后台
链接，不包含完整邮箱或注册 IP。

企微网络、限流和服务端错误按 1、5、20、60 分钟重试。无效凭据和无效
成员不会反复重试；最终失败会生成主管理员后台通知和邮件兜底。

连接配置使用 `APP_ENCRYPTION_KEY` 加密后保存在召回数据库。Worker 会自动运行邮件同步、通知投递、十五分钟增量校准和每日全量校准。

## 11. 分组规则发布与重算

发布 A–G 分组规则前确认 `recall-worker` 健康。发布过程会：

1. 只读预览全部用户的预计分组与任务影响。
2. 创建不可变规则版本和全量重算记录。
3. Worker 按批次重新读取用户最新事实并分配唯一分组。
4. 仅取消 `UNASSIGNED`、`TODO` 状态的旧自动任务。
5. F 组立即生成紧急任务；G 组不生成个人任务。

管理页面会显示处理总数、成功数和失败数。`PARTIAL_FAILURE` 或
`FAILED` 状态可从历史版本面板重新进入队列。回滚会复制目标历史配置，
发布新的版本号并再次全量重算；不会重新激活或改写旧记录。

RightToken 正式数据必须同时提供：

```text
balanceMinor       原始余额最小单位
balanceCurrency    原始余额币种
balanceUsdMinor    按 RightToken 结算汇率换算的美元等值美分
countryCode        根据注册 IP 推算的 ISO 两位国家代码
```

召回服务不抓取汇率。注册 IP 仍加密保存，不得将批量明文 IP 写入日志、
预览响应或通知。

## 12. 备份与恢复演练

创建备份：

```bash
deploy/backup-recall.sh /var/backups/righttoken-recall
```

脚本使用仅部署用户可读的权限生成 PostgreSQL custom-format 备份，并清理 14 天前的日备份。

恢复演练必须在独立测试数据库进行：

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --dbname=righttoken_recall_restore_test \
  /var/backups/righttoken-recall/righttoken-recall-YYYYMMDDTHHMMSSZ.dump
```

不得直接在生产数据库执行未经演练的恢复命令。

## 13. 应用版本回滚

1. 保留当前数据库备份。
2. 将 `RECALL_IMAGE` 改为上一条已验证的 Git SHA。
3. 确认上一版本能够读取当前数据库结构。
4. 重新执行 Compose `config --quiet`。
5. 只更新 Web 和 Worker。
6. 验证两个健康接口、后台首页和一条模拟幂等事件。

如果数据库迁移不向后兼容，不得只回滚镜像；先按已审核的数据库恢复方案处理。

## 14. RightToken 单点登录

正式环境固定：

```text
RECALL_AUTH_MODE=righttoken
RECALL_RIGHTTOKEN_ISSUER=https://righttoken.ai
RECALL_RIGHTTOKEN_AUDIENCE=righttoken-recall
RECALL_RIGHTTOKEN_ADMIN_URL=https://righttoken.ai/user-operations
RECALL_RIGHTTOKEN_SSO_SECRET=<与主站 RECALL_SSO_SSO_SECRET 相同>
```

RightToken 菜单只在 `/api/v1/user/recall/access` 返回允许时显示。点击菜单
后，主站再次校验权限并签发 60 秒一次性票据；召回后台按稳定用户 ID
绑定本地成员，角色仍由召回后台的 `PRIMARY_ADMIN`、`ADMIN`、`OPERATOR`
决定。未邀请、停用或身份冲突的用户一律拒绝。

生产代码同时在环境解析、中间件、页面守卫和写接口四处禁止
`AUTH_MODE=development`。部署后至少验证：

1. 主管理员可进入、导出 CSV、管理管理员。
2. 管理员可进入但不能导出 CSV、不能管理管理员。
3. 运营可进入并查看完整邮箱/IP，但不能导出 CSV。
4. 未获召回权限的主站账号看不到菜单，直接调用 SSO 返回 403。
5. 同一 SSO 票据第二次使用返回 401。
