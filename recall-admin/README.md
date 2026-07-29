# RightToken 用户召回管理后台

该目录是 RightToken 主仓库中的独立召回子应用，负责用户事件、A–G 自动分组、运营任务、地区分配和召回管理。正式访问域名规划为 `https://recall.righttoken.ai`。

## 当前能力

- 用户事件与可配置的 A–G 互斥自动分组
- 分组影响预览、版本历史、全量重算、失败重试和回滚
- 注册两小时未支付等延时任务
- 地区、语言、渠道与负载分配规则
- PostgreSQL 持久化任务队列
- 运营驾驶舱、优先任务、分组分布与团队负载
- 主管理员、管理员和运营人员权限
- 仅主管理员可导出 CSV
- 邮件审核发送、SMTP/IMAP 收信、回复匹配和人工归档
- 公共邮件模板、正文图片、图片附件和来信图片安全预览
- 企微群机器人脱敏通知、失败重试和死信留痕
- RightToken 实时事件接口、模拟数据源和定时全量校准

## 一键启动本地完整环境

需要 Docker Desktop。首次启动会创建 PostgreSQL、执行迁移、写入安全模拟数据，并启动 Web 和 Worker：

```bash
docker compose --env-file .env.example up --build -d
```

打开 `http://127.0.0.1:3000/dashboard`。本地开发无需登录，
系统自动使用数据库中的主管理员作为当前操作人。

停止服务但保留测试数据库：

```bash
docker compose --env-file .env.example down
```

## 不使用 Docker 开发

固定使用 Node.js 24.18 和 PostgreSQL 16：

```bash
cp .env.example .env
npm ci
npm run db:deploy
npm run db:seed
npm run dev -- --hostname 127.0.0.1 --port 3101
```

Worker 另开一个终端运行：

```bash
npm run worker
```

分组规则发布依赖 Worker 执行全量重算。本地验证发布闭环时，
Web、Worker 和 PostgreSQL 必须同时运行；只启动 Web 会使重算记录
停留在“等待”状态。

本地默认使用 3101 端口：

```bash
npm run dev -- --hostname 127.0.0.1 --port 3101
```

## 集成配置

直接在“系统设置”中完成配置，邮箱凭据、Webhook 和接口密钥都会加密保存：

- 客服邮箱：支持 Namecheap Private Email、企业微信邮箱和自定义 SMTP/IMAP。
- 企业微信：保存群机器人 Webhook 后，可先发送一条不含用户信息的测试消息。
- RightToken：正式用户接口未提供前可启用 100 位安全模拟用户；正式接入时切换为 HTTP 模式。

RightToken 实时事件兼容地址：

```text
POST /api/integrations/righttoken/events
POST /api/internal/righttoken/events
```

后台 Worker 每两分钟收取邮件、每分钟投递通知、每十五分钟增量校准用户，并在每天 02:00 执行全量校准。未启用对应连接时任务会安全跳过。

### 邮箱同步异常

在“邮件中心 → 已启用邮箱”选择邮箱，可查看中文运行状态。先执行
“测试连接”，通过后再执行“立即同步”。认证失败、连接超时、安全连接失败、
收件箱不可用和内部处理失败会分别记录；前端不会显示内部错误码。

服务端日志只记录邮箱编号、同步阶段和安全错误分类，不记录邮箱密码、
认证配置、完整邮件正文或图片内容。单封邮件内容无法解析时会记录该次失败，
并继续处理该邮箱中的其他邮件。

### 邮件图片存储

本地开发默认将邮件正文图片和图片附件存放在
`.data/mail-assets`，数据库只保存文件信息及邮件关联。支持 JPG、
PNG 和 WebP；单张不超过 5 MB，每封邮件最多 10 张、合计不超过
20 MB。SVG、GIF 及无法识别的文件会被拒绝。

```env
MAIL_ASSET_STORAGE=local
MAIL_ASSET_LOCAL_DIR=.data/mail-assets
```

生产环境禁止使用本地目录，必须配置私有 S3 或兼容对象存储：

```env
MAIL_ASSET_STORAGE=s3
MAIL_ASSET_S3_BUCKET=righttoken-private-mail-assets
MAIL_ASSET_S3_REGION=ap-southeast-1
MAIL_ASSET_S3_ENDPOINT=
MAIL_ASSET_S3_FORCE_PATH_STYLE=false
MAIL_ASSET_S3_ACCESS_KEY_ID=
MAIL_ASSET_S3_SECRET_ACCESS_KEY=
```

对象存储桶不得公开读取。所有预览和下载都通过召回后台的权限接口，
运营只能访问其负责用户、所领任务或公共模板关联的图片。用户来信中的
外部网络图片默认不会加载，以免触发邮件追踪像素。

## 验证

联调测试自动使用并重置独立的 `_test` 数据库，不会修改本地网页当前使用的
开发数据。

```bash
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run worker:build
npm run bootstrap:build
npm run build
```

生产部署、密钥、Caddy、备份和回滚步骤见 [deployment.md](docs/deployment.md)。

## 安全说明

- `.env`、生产凭据、真实用户数据、备份和构建产物不会进入版本库。
- 本地邮件图片目录 `.data/` 不会进入版本库，生产对象存储桶保持私有。
- 示例数据只使用 `example.test` 地址。
- 本地开发使用 `AUTH_MODE=development` 和 `DEPLOYMENT_ENV=local`，不提供登录、密码、验证码或二次验证。
- 正式环境使用 `AUTH_MODE=righttoken`，身份由 RightToken 主站统一提供。
- 正式身份适配器完成前，不得将本地免登录模式用于公网部署。
- 正式接入通过内部事件 API 和只读校准 API，不直接读写 RightToken 主数据库。

## 分组规则数据约定

- `balanceMinor`：RightToken 原始余额最小单位。
- `balanceCurrency`：原始余额币种。
- `balanceUsdMinor`：RightToken 按其结算汇率提供的美元等值美分；
  召回后台不自行抓取汇率。
- `totalPaidMinor`：RightToken 按内部固定 7 CNY/USD 结算口径归一化的
  累计净支付美元美分，已扣除退款。
- `countryCode`：RightToken 根据注册 IP 解析的两位 ISO 国家代码。
- 注册 IP 继续加密保存，预览样本、通知和审计记录不批量返回明文 IP。

发布规则前系统只读计算全部用户影响；确认后生成不可变版本并分批
重算全部用户。仅未开始的自动任务可被规则迁移取消，进行中、等待用户、
人工和邮件回复任务会保留。回滚会复制历史配置并发布新版本，不会改写
旧版本。
