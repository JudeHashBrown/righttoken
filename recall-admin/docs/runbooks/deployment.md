# 分组规则部署检查单

完整生产步骤见 [部署手册](../deployment.md)。与分组规则相关的发布顺序：

生产发布使用已经接入的 RightToken 主站 SSO 身份适配器，并固定配置
`AUTH_MODE=righttoken`；生产 Compose 将 `DEPLOYMENT_ENV` 固定为
`production`，并拒绝 `AUTH_MODE=development`。免登录模式仅在明确标记为
`local` 的本机环境中生效。

注册 IP 地域解析默认使用服务器本地数据库，不按查询次数收费：

- `GEOIP_MMDB_PATH`：GeoLite2 City `.mmdb` 文件路径。
- `GEOIP_RIR_PATH`：五大 RIR delegated stats 合并快照路径。
- Web 和 Worker 均以只读方式挂载 `/var/lib/righttoken-geoip`。
- 每月更新 GeoLite2，每周更新 RIR 快照；更新失败时保留上一版。
- 在可写的宿主机目录执行
  `npm run geoip:update -- --output /var/lib/righttoken-geoip/delegated-rir.txt`
  即可生成五大 RIR 合并快照。

推荐服务器目录：

```text
/var/lib/righttoken-geoip/
  GeoLite2-City.mmdb
  delegated-rir.txt
```

RIR 快照由 AFRINIC、APNIC、ARIN、LACNIC 和 RIPE NCC 的 delegated
stats 文件拼接生成。本地查询顺序为 GeoLite2 City → RIR 地址段 → 可选 HTTP。

可选 HTTP GeoIP 仅作为最后备用：

- `GEOIP_HTTP_URL`：查询地址，必须包含 `{ip}` 占位符。
- `GEOIP_HTTP_TOKEN`：可选 Bearer Token。
- `GEOIP_HTTP_TIMEOUT_MS`：请求超时，默认 `2000`。

HTTP 服务响应格式为
`{"countryCode":"CN","region":"广东省"}`。未配置或查询失败时不会阻断注册，
用户将在后续全量重算中继续补全地域。邮箱完整域名和国家后缀命中时优先于
IP 结果；原始 IP 国家和地区仍会保留用于审计。

主站访问地域看板复用同一套 GeoIP 解析链，并额外要求：

- 管理台配置独立强随机值 `VISITOR_HASH_KEY`（至少 32 字符）。此密钥只用于
  对主站匿名访客标识做 HMAC；轮换会使轮换前后的访客无法跨周期去重，因此
  不应日常轮换。
- 主站继续使用 `RECALL_SSO_BASE_URL` 和
  `RECALL_SSO_INTERNAL_SECRET` 调用管理台内部访问接收接口，无需向浏览器暴露
  新密钥。
- Gin 的 trusted proxies 必须只包含实际 CDN / 反向代理地址段。访问采集使用
  Gin 可信代理链解析的客户端 IP，不直接信任浏览器提交的转发头。
- 主站浏览器仅持有 HttpOnly、SameSite=Lax 的第一方 `rt_vid` Cookie；
  管理台数据库只保存不可逆访客哈希、国家、CN 省份和不含查询参数的 pathname。
- 原始 IP 仅在单次请求内用于 GeoIP 解析，不写入访问事实或前端响应。
- `SiteVisit` 访问事实保留 180 天；接收成功后每小时最多触发一次过期数据清理。
- 发布后以管理员访问 `/visits`，确认 7/30/90 天趋势、国家排行和中国省份排行；
  运营人员应看不到入口，直接访问也应返回未找到。

邮件图片发布检查：

- `RECALL_MAIL_ASSET_STORAGE` 必须为 `s3`，并配置私有桶、区域和访问凭据。
- AWS S3 的 endpoint 留空；兼容服务填写 HTTPS endpoint，并确认 path-style 设置。
- 部署后分别上传正文图片和图片附件，确认预览接口能读取对象。
- 页面显示“图片存储暂不可用”时检查对象存储连通性与 PutObject 权限；不得把桶
  改为公开，也不得在生产环境回退到容器本地目录。

邮件自动同步检查：

- “测试连接”只验证 SMTP 和 IMAP；首次收信点击“立即收取邮件”。
- `recall-worker` 必须处于运行且健康状态，并每两分钟执行 `mail-sync`。
- Worker 日志不得持续出现 `mail_sync_failed`；出现时按页面分类提示处理。
- 手动收取成功后等待两到四分钟并刷新，最近成功同步时间应继续推进。
- 页面提示自动同步可能未运行时，同时重新创建 Web 和 Worker，不能只更新 Web。

固定发布门禁顺序是：迁移 → 访问链路预检 → Web/Worker。
`recall-visit-verify` 必须使用与 Web 相同的数据库和 GeoIP 环境，
并由容器直接执行预检 bundle；成功输出只包含
`visit_pipeline_ready:<kind>`。

1. 备份召回数据库。
2. 执行 `npm run db:deploy` 或生产迁移容器。
3. 执行 `recall-visit-verify`；如果缺少 `SiteVisit` 表或可用 GeoIP 来源，停止发布。
4. 同时更新 Web 与 Worker，不能只更新 Web。
5. 检查 Web 就绪接口和 Worker 健康状态。
6. 使用模拟用户预览一次规则，不立即修改生产条件。
7. 小范围修改注释并发布，确认全量重算进度能够完成。
8. 检查 F 紧急通知、G 无个人任务和旧任务保留策略。
9. 检查企业微信应用凭据已配置，并抽查所有启用运营成员均已映射 UserID。
10. 向内部测试成员发送应用连接测试，向内部测试群发送机器人连接测试。
11. 确认普通任务只直发负责人，F 组任务同时直发负责人和运营群。

若重算部分失败，先修复数据或连接问题，再从历史面板重试。业务规则回滚
必须通过“回滚到此版本”发布新版本；应用镜像回滚按主部署手册执行。
