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

1. 备份召回数据库。
2. 执行 `npm run db:deploy` 或生产迁移容器。
3. 同时更新 Web 与 Worker，不能只更新 Web。
4. 检查 Web 就绪接口和 Worker 健康状态。
5. 使用模拟用户预览一次规则，不立即修改生产条件。
6. 小范围修改注释并发布，确认全量重算进度能够完成。
7. 检查 F 紧急通知、G 无个人任务和旧任务保留策略。
8. 检查企业微信应用凭据已配置，并抽查所有启用运营成员均已映射 UserID。
9. 向内部测试成员发送应用连接测试，向内部测试群发送机器人连接测试。
10. 确认普通任务只直发负责人，F 组任务同时直发负责人和运营群。

若重算部分失败，先修复数据或连接问题，再从历史面板重试。业务规则回滚
必须通过“回滚到此版本”发布新版本；应用镜像回滚按主部署手册执行。
