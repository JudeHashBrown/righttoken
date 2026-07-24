# RightToken 召回后台部署手册

## 1. 发布边界

- 代码目录：`recall-admin/`
- 生产域名：`https://recall.righttoken.ai`
- 生产服务：`recall-web`、`recall-worker`、`recall-db`
- 一次性任务：`recall-migrate`、`recall-bootstrap`
- 首发身份模式：`standalone`
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
```

依次用于：

1. `RECALL_POSTGRES_PASSWORD`
2. `RECALL_SESSION_COOKIE_SECRET`
3. `RECALL_APP_ENCRYPTION_KEY`
4. `RECALL_INTERNAL_API_SECRET_CURRENT`

数据库密码写入 `RECALL_DATABASE_URL` 和 `RECALL_JOB_DATABASE_URL` 时必须进行 URL 编码。生产镜像使用不可变 Git SHA，例如：

```text
RECALL_IMAGE=ghcr.io/judehashbrown/righttoken-recall:817e28f0
```

不得只使用 `latest`。

## 4. 首次主管理员

在 `recall.env` 临时填写：

```text
RECALL_BOOTSTRAP_PRIMARY_ADMIN_EMAIL=your-admin@company.example
RECALL_BOOTSTRAP_PRIMARY_ADMIN_PASSWORD=使用密码管理器生成的强密码
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

成功后立即清空 `recall.env` 中的主管理员密码。重复执行同一邮箱只更新该账号；如果数据库已经存在其他主管理员，命令会拒绝替换。

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

## 9. 邮箱、企微与用户校准

部署完成后由主管理员进入“系统设置”保存连接信息，不要把邮箱密码、企微 Webhook 或 RightToken API Token 写入镜像：

1. 保存客服邮箱并执行“测试连接”和“立即同步”。
2. 保存企微机器人并发送不含用户信息的测试消息。
3. 首次先使用 RightToken 模拟模式验证任务与分组，再切换正式 HTTP 接口。
4. 正式切换后执行一次全量校准，确认统计结果和抽样用户。

连接配置使用 `APP_ENCRYPTION_KEY` 加密后保存在召回数据库。Worker 会自动运行邮件同步、通知投递、十五分钟增量校准和每日全量校准。

## 10. 备份与恢复演练

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

## 11. 回滚

1. 保留当前数据库备份。
2. 将 `RECALL_IMAGE` 改为上一条已验证的 Git SHA。
3. 确认上一版本能够读取当前数据库结构。
4. 重新执行 Compose `config --quiet`。
5. 只更新 Web 和 Worker。
6. 验证两个健康接口、登录和一条模拟幂等事件。

如果数据库迁移不向后兼容，不得只回滚镜像；先按已审核的数据库恢复方案处理。

## 12. RightToken 单点登录

首发固定：

```text
RECALL_AUTH_MODE=standalone
```

虽然环境示例包含 issuer、audience 和 JWKS 变量，但身份适配器完成并经过安全测试前，不得把生产环境切换为 `righttoken`。系统不存在无鉴权模式。
