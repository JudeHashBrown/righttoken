# RightToken 召回用户只读接口设计

## 目标

在 RightToken 主站新增仅供召回管理后台读取的用户快照接口：

`GET /api/v1/admin/recall/users`

接口提供注册、支付、余额、调用和注册位置归因所需的事实数据。A–G 分组、运营负责人和召回任务仍由召回管理后台计算，主站不复制运营规则。

## 约束

- 接口只读，不提供创建、修改或删除能力。
- 使用独立内部密钥，不复用管理员登录、管理员 JWT 或普通 API Key。
- 密钥只通过运行环境注入，不进入数据库、前端页面、日志或 Git 仓库。
- 测试数据必须为虚构数据。真实邮箱和 IP 只能在运行时短暂读取，不写入快照、日志、CSV、JSON 或测试夹具。
- 首次联调限制读取少量用户，确认闭环后再启用增量同步。

## 鉴权

主站读取环境变量 `RECALL_EXPORT_SECRET`，客户端发送：

`Authorization: Bearer <secret>`

服务端要求非空密钥，并采用固定时长比较。缺失、格式错误或不匹配统一返回 `401`，不在响应和日志中透露失败细节。未配置密钥时接口不可用，避免误开放。

## 查询协议

支持以下查询参数：

- `limit`：默认 50，范围 1–200。
- `updated_after`：可选 ISO 8601 时间，仅读取该时间后发生变化的用户。
- `cursor`：可选不透明游标；存在时优先于 `updated_after`。

采用 `(effective_updated_at, user_id)` 键集分页，稳定升序返回。`effective_updated_at` 是用户资料、订单和调用数据中最近的变化时间。响应结构：

```json
{
  "users": [],
  "nextCursor": null
}
```

## 用户快照

每条用户记录返回：

- `externalUserId`
- `email`
- `displayName`
- `registeredAt`
- `updatedAt`
- `registrationIp`
- `countryCode`
- `region`
- `language`
- `timezone`
- `source`
- `checkoutStartedAt`
- `firstPaidAt`
- `totalPaidMinor`
- `successfulCallCount`
- `lastCallAt`
- `balanceMinor`
- `balanceCurrency`
- `balanceUsdMinor`
- `anomalyActive`

字段即使暂时没有值也必须存在；允许为空的字段返回 `null`。

## 字段来源

- 用户标识、邮箱、显示名、注册时间、余额：`users`。
- 首次进入支付流程：该用户最早支付订单的 `created_at`。
- 首次支付：最早成功支付订单的 `paid_at`。
- 累计支付：成功支付订单 `pay_amount` 合计，转换为 USD 分。
- 成功调用次数、最后调用时间：`usage_logs`。
- 注册 IP：
  1. 新增的 `users.registration_ip`；
  2. 历史用户最早支付订单的 `client_ip`；
  3. 历史用户最早调用日志的 `ip_address`。
- 国家、省份、语言、时区和来源：主站已有值则返回；没有值返回 `null`，由召回后台的邮箱规则和本地 GeoIP 数据解析。
- `anomalyActive`：主站没有统一异常事实时返回 `false`，后续可在不破坏契约的情况下接入真实异常源。

余额和金额必须使用十进制定点转换，不直接对二进制浮点数做不稳定取整。

## 注册 IP 留存

为 `users` 增加可空 `registration_ip` 字段。邮箱注册时将可信代理链解析后的客户端 IP 传入注册服务并一次性保存。OAuth 注册路径也应保存当次客户端 IP；已有用户登录不得覆盖注册 IP。

历史数据不批量伪造注册 IP，只在导出时按支付和调用记录回退。回退值代表“现存最早可用 IP”，不改变主站用户表。

## 分层

- 路由层：注册 `/api/v1/admin/recall/users`，仅挂载召回密钥中间件，不挂管理员认证。
- 中间件：解析并校验独立 Bearer 密钥。
- Handler：校验查询参数、调用服务、输出契约。
- Service/Repository：执行稳定分页和聚合查询，完成金额及时间映射。
- 召回后台：沿用 HTTP 适配器，默认路径改为正式接口地址。

## 测试

测试先行覆盖：

1. 缺失、错误和正确密钥。
2. `limit` 边界、非法时间、非法游标。
3. 稳定分页，无重复和遗漏。
4. 用户、支付、余额、调用聚合映射。
5. 注册 IP 的新用户保存与历史回退顺序。
6. 响应满足召回后台 Zod 契约。
7. 日志和仓库中不存在测试密钥、真实邮箱或真实 IP 数据文件。

## 首次联调

部署后先使用 `limit=5` 读取少量真实用户，结果只通过内存传递给本地召回后台，不落盘。确认用户导入、地区解析、A–G 分组、负责人分配和任务生成后，再开启游标增量同步。
