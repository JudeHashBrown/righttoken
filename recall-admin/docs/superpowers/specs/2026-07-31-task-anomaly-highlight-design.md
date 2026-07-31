# 任务异常原因高亮设计

## 目标

在 F 组异常任务详情页直接说明“具体发生了什么”，用黄底突出错误结论，并同时保留安全的上游原始错误信息，避免运营只能看到“连续调用失败告警”。

## 数据来源

RightToken `public.ops_error_logs` 已提供 `upstream_error_message`、`error_message` 和 `upstream_error_detail`。同步时按以下优先级取值：

1. `upstream_error_message`
2. `error_message`
3. `upstream_error_detail`

不读取或展示 `error_body`、请求正文、请求头，避免把密钥、提示词或其他敏感内容带入运营台。原始错误文本去除多余空白并限制为 500 个字符。

召回库在 `UserProfile.anomalyErrorMessage` 保存当前有效异常的错误原文；异常恢复时与其他异常详情一起清空。事件入口允许通过 `service.anomaly.payload.error_message` 接收同一信息。

创建 F 组异常任务时，另在 `RecallTask.anomalySnapshot` 保存当时的安全异常详情。任务页优先读取这份快照，因此用户异常恢复、当前字段被清空后，历史任务仍能说明当时的具体错误。没有快照的旧异常任务仍显示黄色卡，并明确提示“未返回可识别的具体错误类型”。

## 诊断展示

`presentServiceAnomaly` 在现有分类基础上增加用户可读诊断：

- `no accounts available`、`no_available_account`：上游无可用账号
- `insufficient quota`、`quota_exceeded`、`credit balance`：上游账户额度不足
- `insufficient balance`、`balance exhausted` 且责任方为 client/user：用户余额不足
- `timeout`、`connection`、`network`、`dns`：链路或网络错误
- routing 阶段：平台路由错误
- internal/platform：平台内部错误
- provider/upstream：上游服务错误
- 无法识别：未返回可识别的具体错误类型

页面显示“中文结论（原始错误）”。若原文与错误类型完全相同，只展示一次。原文按纯文本渲染，不插入 HTML。

## 页面

任务详情页在标题和旧任务原因下方增加黄色错误卡：

- 标签：`具体错误`
- 主结论：中文诊断
- 原始错误：等宽或普通小号文本
- 补充信息：HTTP 状态、模型、失败次数、最近发生时间

服务异常任务始终显示该卡。新任务使用任务创建时的异常快照；旧任务在无快照时使用当前异常详情或明确的未知原因兜底。旧任务原因仍保留，作为任务创建时的审计文本。

## 测试

- 单元测试覆盖常见错误映射、原文优先级、未知原因和纯文本输出。
- 组件测试覆盖黄色错误卡、中文结论与原始错误。
- 数据库适配器和同步集成测试覆盖原始错误进入 `UserProfile` 以及恢复时清空。
- 任务查询/页面测试覆盖异常字段能够到达任务详情页。
- 任务生命周期测试覆盖创建 F 组任务时保存异常快照；任务展示测试覆盖异常恢复后仍显示黄底详情。

## 约束

- 不发送邮件，不触发真实任务处理。
- 不暂存、不提交、不推送；延续用户要求最后统一提交 GitHub。
