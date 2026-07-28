# RightToken 用户运营管理上线集成设计

## 目标

将召回后台以“用户运营管理”的名称接入 RightToken 主站，并满足：

- 从 RightToken 管理后台点击“用户运营管理”后自动登录。
- 未获得召回权限的主站用户不显示入口，也不能直接访问召回后台。
- 召回后台继续使用 `PRIMARY_ADMIN`、`ADMIN`、`OPERATOR` 三种角色。
- 只有主管理员可以导出 CSV、管理管理员和转移主管理员身份。
- 生产环境不得启用免登录开发模式。
- 首版通过每 15 分钟增量同步和每天一次全量校准接入真实用户数据。

## 身份与权限架构

RightToken 主站负责证明“当前是谁”，召回后台的 `Member` 表负责决定“是否允许进入”和“进入后是什么角色”。主站的全局 `admin/user` 角色不能直接替代召回后台的三种角色。

`Member` 增加可空且唯一的 `rightTokenUserId`。首次登录时，召回后台优先按该字段查找成员；尚未绑定时允许按规范化邮箱匹配已有成员，并在验证成功后完成一次性绑定。已绑定到其他 RightToken 用户的成员不得重新绑定。

主管理员通过现有成员管理功能邀请、启用、停用和设置角色。RightToken 主站不保存第二份召回角色配置。

## 入口可见性

主站新增两个受 JWT 保护的接口：

- `GET /api/v1/user/recall/access`：向召回后台内部授权检查接口查询当前用户是否为有效成员。
- `POST /api/v1/user/recall/sso`：确认有权访问后签发 60 秒有效的一次性登录票据，返回召回后台登录地址。

召回后台新增内部接口：

- `POST /api/internal/righttoken/access-check`：使用独立内部密钥鉴权，根据 RightToken 用户 ID 和邮箱返回是否允许访问。
- `GET /api/auth/righttoken/callback?ticket=...&next=...`：校验票据并建立召回后台 HttpOnly 会话。

主站侧边栏在授权检查返回 `allowed=true` 时显示“用户运营管理”。点击后调用 SSO 接口，再跳转到返回的 URL。

## 一次性票据

主站使用独立的 `RECALL_SSO_SECRET` 对紧凑 JSON 票据进行 HMAC-SHA256 签名。载荷固定包含：

- `iss`: `righttoken`
- `aud`: `righttoken-recall`
- `sub`: RightToken 用户 ID
- `email`
- `name`
- `iat`
- `exp`: 不超过签发时间 60 秒
- `jti`: 128 位随机值

召回后台必须校验签名、发行方、受众、时间窗口、邮箱格式和 `jti`。成功后把 `jti` 写入唯一约束表，重复使用返回 401。票据不得写入日志。

## 会话与生产保护

票据兑换成功后创建现有 `rt_recall_session` HttpOnly、Secure、SameSite=Lax 会话，并跳转到经过白名单校验的站内路径，默认 `/dashboard`。

生产构建与容器启动同时检查：

- `NODE_ENV=production` 时 `AUTH_MODE` 必须为 `righttoken`。
- `RECALL_SSO_SECRET` 和内部接口密钥不得为空且不少于 32 字符。
- `/login` 和 `/2fa/setup` 不提供独立登录界面，只重定向到主站管理后台。

## 真实用户数据

主站只读接口继续使用：

`GET /api/v1/admin/recall/users`

首版修正并验证以下口径：

- `successfulCallCount` 和 `lastCallAt` 只统计成功调用。
- `checkoutStartedAt` 使用支付订单创建时间，并在文档中明确其业务含义是“创建首个支付订单”，不是前端打开收银台。
- 金额统一以美元最小货币单位返回；数据库 decimal 值乘以 100 后四舍五入。
- `anomalyActive` 从可确认的服务异常事实计算；没有可靠异常事实时保持 `false`，并在上线验收中明确 F 组不会由快照接口自动触发。
- 注册 IP 优先使用 `users.registration_ip`，旧用户依次回退到首个支付 IP、首个调用 IP。

## 同步策略

- 首次上线执行一次全量导入。
- 增量同步间隔为 15 分钟。
- 每天北京时间 02:00 执行一次全量校准。
- 每次同步后自动执行地区识别、负责人分配、A–G 分组和任务触发。
- 全量导入必须输出主站数量、召回后台数量、成功数、失败数和跳过数，不在日志中输出完整邮箱或 IP。

## CSV 权限

新增真实 CSV 导出接口和按钮。服务端必须调用 `requirePermission("users:export")`，不能只依赖前端隐藏按钮。CSV 仅包含当前主管理员有权查看的数据，并记录审计日志。管理员和运营访问接口均返回 403。

## 测试与验收

- Go 单元测试覆盖 SSO 票据签发、授权检查、成功调用过滤和金额换算。
- Next.js 单元/集成测试覆盖票据验签、防重放、成员绑定、未授权拒绝、生产模式保护和 CSV 权限。
- Vue 单元测试覆盖入口隐藏、入口显示和自动跳转。
- 使用脱敏数据库副本核对至少 20 个用户的注册、支付、余额、调用和 IP。
- 上线前运行 Go、Next.js、Vue 的类型检查、单元测试、集成测试和生产构建。

