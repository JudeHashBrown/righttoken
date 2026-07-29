# RightToken 用户运营管理部署手册

## 1. 上线结构

生产环境使用 RightToken 现有 PostgreSQL，不再启动独立
`recall-db`：

- `public`：主站用户、支付、余额、成功调用和异常事实。
- `recall`：成员、权限、分组、负责人、任务、邮件和审计。
- `pgboss`：运营后台 Worker 队列。

运营服务使用独立账号 `righttoken_recall_app`。该账号对指定
`public` 表只有读取权限，只能写入 `recall` 和 `pgboss`。

生产服务包括 `recall-migrate`、`recall-web` 和
`recall-worker`，统一加入主站 `sub2api-network`。访问域名为
`https://recall.righttoken.ai`。

## 2. 发布前备份

先对主站数据库做完整备份，并确认备份可以在隔离环境恢复。不要直接在
生产库演练恢复。

在服务器部署目录准备：

```text
deploy/
├── .env
├── recall.env
├── docker-compose.yml
├── docker-compose.recall.yml
└── Caddyfile.recall
```

复制环境变量示例：

```bash
cp deploy/recall.env.example deploy/recall.env
chmod 600 deploy/recall.env
```

`recall.env`、数据库密码、SSO 密钥、邮箱密码和企微 Secret 均不得提交
到 Git。

## 3. 创建最小权限账号

由主站数据库所有者执行：

```bash
psql "$RIGHTTOKEN_DATABASE_OWNER_URL" \
  --set=recall_password='替换为强随机密码' \
  --file=recall-admin/scripts/grant-shared-database-access.sql
```

将同一密码进行 URL 编码后写入：

```text
RECALL_DATABASE_URL=postgresql://righttoken_recall_app:密码@postgres:5432/sub2api?schema=recall
RECALL_JOB_DATABASE_URL=postgresql://righttoken_recall_app:密码@postgres:5432/sub2api
```

首次切换前先完成第 5 节的数据库迁移，再运行只读边界检查。此时
`recall` 表尚未创建，不能提前执行完整验证脚本。

## 4. 生产身份和密钥

生产固定配置：

```text
RECALL_AUTH_MODE=righttoken
RECALL_APP_URL=https://recall.righttoken.ai
RECALL_RIGHTTOKEN_ISSUER=https://righttoken.ai
RECALL_RIGHTTOKEN_AUDIENCE=righttoken-recall
RECALL_RIGHTTOKEN_ADMIN_URL=https://righttoken.ai/user-operations
RECALL_RIGHTTOKEN_DASHBOARD_URL=https://righttoken.ai/dashboard
RECALL_RIGHTTOKEN_SSO_SECRET=<与主站 RECALL_SSO_SSO_SECRET 完全相同>
RECALL_SSO_BASE_URL=https://recall.righttoken.ai
```

`RECALL_RIGHTTOKEN_ADMIN_URL` 用于未登录用户进入主站授权流程；
`RECALL_RIGHTTOKEN_DASHBOARD_URL` 专门用于运营后台顶部的“返回主站”入口，
两者用途不同，不应复用。

另外分别生成：

1. `RECALL_SESSION_COOKIE_SECRET`：至少 32 位随机值。
2. `RECALL_APP_ENCRYPTION_KEY`：Base64 编码的 32 字节密钥。
3. `RECALL_INTERNAL_API_SECRET_CURRENT`：至少 32 位随机值。
4. `RECALL_RIGHTTOKEN_SSO_SECRET`：至少 32 位随机值。

这些密钥不得互相复用。生产 Compose 固定
`RIGHTTOKEN_SOURCE_MODE=database` 和 `DEPLOYMENT_ENV=production`；
发现 `AUTH_MODE=development` 时应用会拒绝启动。

## 5. 数据库迁移与部署

镜像必须使用不可变 Git SHA，不使用 `latest`：

```text
RECALL_IMAGE=ghcr.io/judehashbrown/righttoken-recall:YOUR_GIT_SHA
```

先解析配置：

```bash
docker compose \
  --env-file deploy/.env \
  --env-file deploy/recall.env \
  -f deploy/docker-compose.yml \
  -f deploy/docker-compose.recall.yml \
  config --quiet
```

先只运行数据库迁移：

```bash
docker compose \
  --env-file deploy/.env \
  --env-file deploy/recall.env \
  -f deploy/docker-compose.yml \
  -f deploy/docker-compose.recall.yml \
  run --rm recall-migrate
```

如果以前已经在独立 `recall-db` 中运行过生产数据，迁移完成后、启动
Web 前必须将成员、权限、任务、邮件和审计状态搬入共享库。目标
`recall` 除迁移自带的地区默认规则外必须为空，目标 `pgboss` 不能已经
启动 Worker。先进入维护窗口，停止旧 Web 和 Worker，确认旧库不再接收
新任务并完成完整备份，然后执行：

```bash
LEGACY_RECALL_DATABASE_URL='postgresql://旧库连接' \
RIGHTTOKEN_DATABASE_OWNER_URL='postgresql://主站库所有者连接' \
  recall-admin/scripts/migrate-legacy-recall-state.sh
```

全新部署没有旧状态时跳过此命令。搬迁旧库时必须沿用原来的
`RECALL_APP_ENCRYPTION_KEY`，否则旧加密字段无法解密。脚本会在一个
事务中搬迁全部运营状态和 `pgboss` 队列；任何一步失败都会整体回滚。
搬迁后再次执行第 3 节的最小权限授权脚本，使恢复后的 `pgboss` 对
运营服务账号可读写，然后再运行下面的边界检查。

随后使用最小权限账号运行边界检查：

```bash
psql "$RECALL_DATABASE_URL" \
  --file=recall-admin/scripts/verify-shared-database.sql
```

必须满足：

- 四张主站表可读取；
- `public` 主站表没有任何写入、建表或继承角色权限；
- `recall`、`pgboss` 可访问；
- 成员身份和运营状态没有孤儿主站用户 ID。

全新部署此时还没有主管理员。主管理员邮箱必须是已经注册的
RightToken 用户。在 `recall.env` 临时设置：

```text
RECALL_BOOTSTRAP_PRIMARY_ADMIN_EMAIL=your-admin@company.example
RECALL_BOOTSTRAP_PRIMARY_ADMIN_NAME=主管理员
```

运行一次：

```bash
docker compose \
  --env-file deploy/.env \
  --env-file deploy/recall.env \
  -f deploy/docker-compose.yml \
  -f deploy/docker-compose.recall.yml \
  --profile recall-bootstrap \
  run --rm recall-bootstrap
```

已有生产状态完成搬迁后不再重复创建主管理员。全新部署创建成功后立即
清空临时邮箱。主管理员首次从主站进入时会绑定稳定的主站用户 ID。

检查通过后再启动 Web 和 Worker：

```bash
docker compose \
  --env-file deploy/.env \
  --env-file deploy/recall.env \
  -f deploy/docker-compose.yml \
  -f deploy/docker-compose.recall.yml \
  up -d recall-web recall-worker
```

迁移或权限检查失败时不得启动 Web 和 Worker。Prisma 只管理
`recall`，不得修改 `public` 主站表。

## 6. 主站入口与自动登录验收

主站侧边栏在“个人资料”下方显示“用户运营管理”，显示条件来自：

```text
GET /api/v1/user/recall/access
```

点击后由主站再次检查权限，签发 60 秒一次性票据，再跳转到运营后台建立
HttpOnly 会话。上线时使用四个测试身份逐项确认：

1. 主管理员可进入、导出 CSV、管理管理员和发布全局规则。
2. 管理员可查看全局数据、管理运营，但不能导出 CSV 或管理管理员。
3. 运营只能查看分配给自己的用户和任务，可查看完整邮箱和 IP。
4. 未授权主站用户看不到入口，直接请求 SSO 也返回拒绝。

再确认同一票据不能二次使用，成员权限撤销后其现有运营会话立即失效。

## 7. 数据与计算验收

运营页面的邮箱、用户名、注册时间、IP、支付、余额、成功调用和异常状态
以主站表实时值为准。`usage_logs` 是成功计费调用；失败请求位于
`ops_error_logs`，不计入成功调用次数。

金额口径：

- 支付订单为人民币，按主站现有固定 `7 CNY/USD` 口径转换为美元美分。
- 用户余额为美元，转换为美元美分。

发布分组规则后执行全量重算，并核对：

- 所有有效用户只进入 A–G 中唯一一组；
- F 组立即生成紧急任务；
- G 组不生成个人召回任务；
- 地区负责人按国家/省份规则分配；
- 页面用户总数与主站有效用户数一致；
- 不在日志、通知、截图或 Git 中输出真实邮箱和 IP。

### 负责人分配迁移验收

本次版本包含客户负责人状态和成员地区规则字段。部署镜像前必须先运行
第 5 节的 `recall-migrate`，确认以下迁移已成功：

```text
20260729173000_add_owner_assignment_state
20260729190000_mark_member_territory_rules
```

迁移完成后，以只读方式检查负责人状态：

```sql
SELECT "ownerAssignmentMode", COUNT(*)
FROM recall."UserProfile"
WHERE "sourceDeletedAt" IS NULL
GROUP BY "ownerAssignmentMode";

SELECT COUNT(*) AS users_without_owner
FROM recall."UserProfile"
WHERE "sourceDeletedAt" IS NULL
  AND "ownerId" IS NULL;
```

上线验收要求：

1. 新同步用户会立即按省份/州优先、国家其次的规则获得负责人。
2. 没有地区规则可匹配的用户由主管理员暂管，`users_without_owner` 为 0。
3. 手动调整一个用户后执行增量同步和规则重算，负责人保持不变。
4. 点击“恢复自动分配”后，该用户按最新地区规则重新分配。
5. 撤销一个测试运营的权限，其客户和未完成任务自动转移；已完成和已取消
   任务的历史负责人保持不变。
6. 普通运营账号只能看到自己的客户和任务。

## 8. 邮箱、企微与健康检查

邮箱和企微连接仍由主管理员在“系统设置”配置。主站用户数据不再在页面
填写接口地址或读取密钥。

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

预期 `recall-web`、`recall-worker` 健康，
`recall-migrate` 退出码为 0，且没有 `recall-db`。

## 9. 回滚

1. 保留发布前数据库备份。
2. 将 `RECALL_IMAGE` 改为上一条已验证 SHA。
3. 先回滚 Web 和 Worker。
4. 再验证健康接口、主站 SSO、成员权限和一条内部测试任务。
5. 只有在隔离环境验证恢复方案后，才考虑恢复 `recall` schema。

不要回滚或覆盖 `public` 主站业务表。分组业务规则回滚应在历史版本页面
发布一个新版本完成，不直接修改历史记录。
