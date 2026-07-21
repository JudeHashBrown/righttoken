# Sub2API 部署 SOP（从 0 到 1）

> 目标：一台全新的 Linux 服务器，1 小时内跑起来一个可用的中转站。
> 适用对象：技术负责人 / 运维 / 打算自己开一个中转站的朋友。

---

## 阶段总览

```
[阶段 0] 前置准备（30 分钟，可以并行）
        ├── 云服务器（1 台）
        ├── 域名（1 个）
        └── DockerHub / OpenAI Platform Key（可选）
                    ↓
[阶段 1] 服务器初始化（10 分钟）
        └── 装 Docker + Docker Compose
                    ↓
[阶段 2] 拉起服务（10 分钟）
        └── 下载 deploy 文件 → 改 .env → docker compose up -d
                    ↓
[阶段 3] 域名 + HTTPS（10 分钟）
        └── DNS 解析 → Caddy 反代 → 证书自动申请
                    ↓
[阶段 4] 首次登录 + 基础配置（10 分钟）
        └── admin 登录 → 建分组 → 添加账号 → 定价
                    ↓
[阶段 5] 支付渠道（可选，30 分钟）
        └── Stripe / 易支付 / 微信支付
                    ↓
[阶段 6] 上线运营
        └── 监控、备份、更新
```

---

## 阶段 0：前置准备

### 0.1 云服务器规格建议

| 用户量 | CPU | 内存 | 磁盘 | 带宽 | 参考月费 |
|---|---|---|---|---|---|
| 试运营（< 50 人） | 2 核 | 4 GB | 50 GB SSD | 5 Mbps | ¥50-100 |
| 小规模（< 500 人） | 4 核 | 8 GB | 100 GB SSD | 10 Mbps | ¥300-500 |
| 中等规模（< 5000 人） | 8 核 | 16 GB | 200 GB SSD | 20 Mbps | ¥1000+ |

**推荐机房**：
- **国内用户为主**：阿里云 / 腾讯云香港节点、RackNerd 洛杉矶（性价比高）
- **海外用户为主**：Vultr / DigitalOcean 洛杉矶 / 新加坡

**系统**：Ubuntu 22.04 LTS（本 SOP 以此为准）或 Debian 12。

### 0.2 域名

任意一个你能改 DNS 的域名即可（`.com`、`.ai`、`.io` 都行）。

- 建议提前把 A 记录指到服务器 IP，让 DNS 有时间生效

### 0.3 可选：OpenAI Platform Key

如果你打算在管理后台配置 "自动模型探测"（新模型出来自动发现），需要一个 OpenAI / Anthropic 官方 API key（花 5 美元充值就够，只用于调 `/v1/models` 探测）。

---

## 阶段 1：服务器初始化

SSH 上服务器（假设你用 root 用户）：

```bash
ssh root@你的服务器IP
```

### 1.1 装 Docker + Docker Compose

```bash
# 一键装脚本
curl -fsSL https://get.docker.com | sh

# 启动 Docker
systemctl enable docker && systemctl start docker

# 验证
docker --version
docker compose version
```

### 1.2 装几个常用工具

```bash
apt update
apt install -y curl wget vim git htop ufw
```

### 1.3 开防火墙（可选，云厂商已有安全组也可跳过）

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (Caddy 会用)
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## 阶段 2：拉起服务

### 2.1 创建部署目录

```bash
mkdir -p /opt/sub2api && cd /opt/sub2api
```

### 2.2 下载部署文件

```bash
# 下载 docker-compose.yml 和 .env.example
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/JudeHashBrown/righttoken/main/deploy/docker-compose.yml

curl -fsSL -o .env.example \
  https://raw.githubusercontent.com/JudeHashBrown/righttoken/main/deploy/.env.example

# 复制成正式配置文件
cp .env.example .env
```

### 2.3 生成关键密钥

**必须**先生成 3 个随机密钥（生成后一次填进 .env，不要每次启动重新生成）：

```bash
# 数据库密码
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"

# JWT 签名密钥
echo "JWT_SECRET=$(openssl rand -hex 32)"

# 2FA 加密密钥
echo "TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

复制这三行输出。

### 2.4 编辑 .env

```bash
vim .env
```

**至少改这几项**（其他保持默认）：

```bash
# 数据库密码（贴上面生成的）
POSTGRES_PASSWORD=xxxxxxxxxxxxx

# JWT 密钥（贴上面生成的）
JWT_SECRET=xxxxxxxxxxxxx

# 2FA 密钥（贴上面生成的）
TOTP_ENCRYPTION_KEY=xxxxxxxxxxxxx

# 管理员账号（第一次启动会自动创建）
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=YourStrongPassword123!

# 时区
TZ=Asia/Shanghai

# 服务模式
SERVER_MODE=release
RUN_MODE=standard
```

保存退出（`:wq`）。

### 2.5 用国内镜像加速（如果服务器在国内）

如果你在国内服务器，DockerHub 拉取速度可能很慢。改一下 Docker daemon：

```bash
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://mirror.gcr.io"
  ]
}
EOF
systemctl restart docker
```

### 2.6 启动

```bash
cd /opt/sub2api
docker compose up -d
```

首次启动约 2-5 分钟（拉镜像 + 初始化数据库）。观察日志：

```bash
docker compose logs -f sub2api
```

看到类似 `Server started on :8080` 或有稳定 http 访问日志就成功了。

### 2.7 验证

```bash
curl http://127.0.0.1:8080/health
# 期望返回类似 {"status":"ok"}
```

浏览器打开 `http://你的服务器IP:8080` 应该能看到登录页。

---

## 阶段 3：域名 + HTTPS

### 3.1 DNS 解析

去域名服务商后台，给你的域名加一条 A 记录：

```
类型: A
主机记录: @（或 www、api 等子域名）
记录值: 你的服务器 IP
TTL: 600
```

用 `dig` 验证解析生效：
```bash
dig +short 你的域名.com
# 应该返回服务器 IP
```

### 3.2 装 Caddy 做反代 + 自动 HTTPS

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
    tee /etc/apt/sources.list.d/caddy-stable.list

apt update
apt install -y caddy
```

### 3.3 配置 Caddy

```bash
vim /etc/caddy/Caddyfile
```

内容替换成：

```caddy
你的域名.com {
    # SSE / 长连接必须调大 timeout，避免流式 API 中断
    reverse_proxy 127.0.0.1:8080 {
        transport http {
            read_timeout 600s
            write_timeout 600s
        }

        # 关闭响应 buffer，SSE 才能真流式
        flush_interval -1
    }

    # 日志（可选）
    log {
        output file /var/log/caddy/access.log
        format json
    }
}
```

**注意**：把 `你的域名.com` 换成实际域名。

### 3.4 启动 Caddy

```bash
systemctl enable caddy && systemctl restart caddy

# 看状态
systemctl status caddy
```

Caddy 会**自动申请 Let's Encrypt 证书**，几秒到 30 秒后就好。

浏览器打开 `https://你的域名.com` 应该看到登录页且有 🔒 小锁图标。

---

## 阶段 4：首次登录 + 基础配置

### 4.1 登录 Admin

浏览器打开 `https://你的域名.com/login`，用 `.env` 里配的 `ADMIN_EMAIL` + `ADMIN_PASSWORD` 登录。

首次登录后**建议立即启用 2FA**（管理员 → 账户设置 → 安全）。

### 4.2 建立分组（Group）

分组决定"哪些用户能用哪些模型走哪些账号"。

Admin → **分组** → **新建分组**。典型配置：

| 分组名 | 平台 | 类型 | 用途 |
|---|---|---|---|
| Claude | anthropic | standard | 按量付费的 Claude 用户 |
| OpenAI | openai | standard | 按量付费的 GPT / Codex 用户 |
| Gemini | gemini | standard | 按量付费的 Gemini 用户 |
| OpenAI 套餐 | openai | subscription | 月订阅用户 |
| Claude 套餐 | anthropic | subscription | 月订阅用户 |

**订阅型 group** 要额外设置日/周/月配额上限（在 group 编辑页）。

### 4.3 定价

Admin → **模型定价** → 给每个模型配价格。参考：

- Claude Opus 4.6：input $15 / M tokens, output $75 / M tokens
- GPT-5：input $2 / M tokens, output $10 / M tokens
- Gemini 2.5 Pro：input $1.25 / M tokens, output $10 / M tokens

**注意**：这是给用户看的**卖价**，会自动加计费倍率。你的**成本价**如果是拆号 Plus 账号（$20/月），毛利率可以非常高（80%+）。

---

## 阶段 5：接入上游账号

### 5.1 Claude 账号（Plus 拆号）

Admin → **账号管理** → **新建账号** → 平台选 Anthropic

- **认证方式**：OAuth 拆号 or API key
- **OAuth 拆号**：跟着向导登录 claude.ai Plus 账号即可
- **API key**：填 `sk-ant-xxx`（来自 https://console.anthropic.com）
- **归属分组**：勾选可用它的 group（如 Claude、Claude 套餐）
- **拆号倍率**：1 个 Plus 账号能服务几个用户，通常 1:3 到 1:5

### 5.2 OpenAI 账号（Codex Plus 拆号）

同上，平台选 OpenAI。

**关键**：Codex 路径（`/v1/responses`）要求账号支持 gpt-5-codex 系列模型。**拆号建议 1:2** 因为 codex 单人用量大。

### 5.3 Gemini 账号

平台选 Gemini。可用 OAuth（个人 Google 账号）或 API key。

### 5.4 测试账号联通性

Admin → 账号列表 → 点某账号 → **测试连接**。绿色✓表示能正常发送请求。

---

## 阶段 6：支付渠道（可选，如果要做 SaaS 卖服务）

Admin → **支付渠道** → 挑一个：

### 6.1 Stripe（国际用户，推荐）

- 去 https://stripe.com 注册（需要海外身份）
- 拿到 `sk_live_...` 和 webhook secret
- Admin 界面填进去
- 支持信用卡 / Apple Pay / Google Pay 等

### 6.2 易支付（国内用户）

- 找一个可靠的易支付平台注册（如码支付、易支付等）
- 拿到商户号 + 密钥
- Admin 界面填进去
- 支持支付宝 / 微信

### 6.3 定制订阅套餐

Admin → **订阅套餐** → 新建：
- 名字：Codex 月度 Pro
- 价格：¥99 / 月
- 归属分组：OpenAI 套餐
- 每日 / 每周 / 每月 用量上限（例如 daily $10 / monthly $200）

---

## 阶段 7：常见运维

### 7.1 更新镜像

```bash
cd /opt/sub2api
docker compose pull sub2api
docker compose up -d --force-recreate sub2api
```

### 7.2 备份数据库

**建议每日 cron**：

```bash
# 加进 crontab
crontab -e

# 每天凌晨 3 点备份，保留最近 7 天
0 3 * * * cd /opt/sub2api && docker compose exec -T postgres pg_dump -U sub2api sub2api | gzip > /root/backups/sub2api-$(date +\%Y\%m\%d).sql.gz && find /root/backups -name "sub2api-*.sql.gz" -mtime +7 -delete
```

先建目录：`mkdir -p /root/backups`。

### 7.3 查日志

```bash
cd /opt/sub2api

# 实时看 sub2api 日志
docker compose logs -f --tail=100 sub2api

# 按 request_id 查
docker compose logs --tail=5000 sub2api | grep "xxxx-xxxx-xxxx"

# 数据库
docker compose exec postgres psql -U sub2api -d sub2api
```

### 7.4 常见故障速查表

| 症状 | 原因 | 解决 |
|---|---|---|
| 502 Bad Gateway | 上游账号被封 / 限流 | Admin 看账号池状态，暂停有问题的账号 |
| 401 INVALID_API_KEY | 用户 key 错了或过期 | 让用户重新去 API Key 页面生成 |
| 403 INSUFFICIENT_BALANCE | 用户没钱 / 订阅未生效 | 让用户充值；或查订阅 group_id 是否绑对 |
| 404 no active subscription | key 绑了订阅分组但用户没订阅 | 让用户下单订阅或换到按量分组 |
| 502 upstream error 400 tool call | 客户端会话状态坏了 | 让客户重开会话 / 新建 chat |
| 流式响应中断 Reconnecting | 中间层 idle timeout | 检查 Caddy timeout（≥ 600s）、Cloudflare 是否 proxy（免费版 100s 上限）|

### 7.5 监控（推荐）

- **Grafana + Prometheus**：装个监控面板看 QPS / 延迟 / 账号池健康度
- **UptimeRobot**：免费，监控 `https://你的域名.com/health`，掉线 SMS/邮件提醒

### 7.6 客服 & 客户群

- 建立 QQ / 微信 / Discord 客户群
- 教程页链接：`https://你的域名.com/tutorials`
- 常见问题：让客户先看 [教程 → 常见问题] 再问

---

## 阶段 8：上线检查清单

正式对外开放前，逐项确认：

- [ ] `https://你的域名.com` 能打开、有 🔒 图标
- [ ] `.env` 里的 `JWT_SECRET`、`TOTP_ENCRYPTION_KEY`、`POSTGRES_PASSWORD` 都是随机生成的（不是默认值）
- [ ] Admin 账号密码是强密码且启用了 2FA
- [ ] `.env` 文件权限是 `chmod 600 .env`（防止别人读）
- [ ] 数据库每日备份 cron 生效
- [ ] Caddy timeout 是 600s+（否则流式 API 会断）
- [ ] 至少有 1 个测试成功的上游账号
- [ ] 至少有 1 个测试用户能完整跑通"注册 → 充值 → 用 key → 消费扣款"
- [ ] 教程页 `/tutorials/claude` `/tutorials/codex` `/tutorials/gemini` 能正确显示
- [ ] 如果要用 Cloudflare CDN：**关掉橙色云朵（改灰色）** 或用付费版，否则流式 API 100 秒必断
- [ ] 备份密钥（`.env` 文件）到你自己的密码管理器 —— 服务器炸了没备份就白干了

---

## 附录 A：架构图

```
用户浏览器 / codex CLI / Claude Code
        ↓ HTTPS
    Caddy 反代（自动 HTTPS）
        ↓ 127.0.0.1:8080
    sub2api 容器（Go 后端 + Vue 前端 embed）
        ├── PostgreSQL 容器（用户/账号/订单/日志）
        └── Redis 容器（缓存/限流/会话）
        ↓ 出站
    上游账号池
        ├── Claude Plus 账号（OAuth token）
        ├── OpenAI Plus / Codex 账号
        └── Google Gemini 账号
        ↓
    Anthropic / OpenAI / Google 后端
```

## 附录 B：如果服务器上就有代码想自己 build

不用公开镜像，自己 build：

```bash
git clone https://github.com/JudeHashBrown/righttoken.git /opt/sub2api-src
cd /opt/sub2api-src

# build 镜像（约 5-10 分钟）
docker buildx build --platform linux/amd64 --tag my-sub2api:latest -f Dockerfile --load .

# 修改 docker-compose.yml 的 image 行为：
#   image: my-sub2api:latest
# 然后 up -d
cd /opt/sub2api
docker compose up -d
```

## 附录 C：多机部署（进阶）

如果你要扩到多台机器：

1. **数据库/Redis 独立部署**：单独一台机器跑 postgres + redis，可用 AWS RDS / 阿里云 RDS 托管
2. **sub2api 无状态多副本**：在多台机器起 sub2api 容器，连同一个 DB
3. **前面加 nginx / ALB / SLB 做负载均衡**

`.env` 里的这几个参数必须相同：
- `JWT_SECRET`（否则用户 token 跨机器失效）
- `TOTP_ENCRYPTION_KEY`
- 数据库连接指向同一台

## 附录 D：常见问题（FAQ）

**Q: 我能不能不装 Caddy，用 nginx？**
A: 可以。nginx 配置例：
```nginx
server {
    listen 443 ssl http2;
    server_name 你的域名.com;
    # ssl 证书用 certbot 自动申请

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 600s;
        proxy_buffering off;  # SSE 必须
    }
}
```

**Q: 用 Cloudflare CDN 会有问题吗？**
A: **免费版会**。免费 CF 有 100 秒 stream idle timeout，长 thinking / 大响应会中断。要么灰云朵（不走 CF proxy），要么升级 Enterprise。

**Q: 一台 4GB 服务器能跑多少并发？**
A: 大约 100-200 并发（sub2api 本身是 Go 写的比较省内存，主要瓶颈是 postgres 连接数）。QPS 峰值约 50-100。

**Q: 用户忘记密码怎么办？**
A: SSH 上服务器直接改 DB：
```bash
docker compose exec postgres psql -U sub2api -d sub2api -c \
  "UPDATE users SET password_hash='新哈希' WHERE email='xxx@example.com';"
```
密码 hash 生成用 bcrypt 工具。**更好办法**：Admin 后台加"重置用户密码"按钮（如果没有，让用户联系客服）。

**Q: 我想把镜像推到自己的 DockerHub / 阿里云镜像仓库？**
A: 见附录 B build 完之后：
```bash
docker tag my-sub2api:latest 你的仓库/sub2api:latest
docker push 你的仓库/sub2api:latest
```

---

## 附录 E：快速部署脚本（懒人版）

如果嫌上面步骤太多，一键脚本（先看懂再跑，别盲执行）：

```bash
#!/bin/bash
set -e

# 装 docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# 部署目录
mkdir -p /opt/sub2api && cd /opt/sub2api

# 拉配置文件
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/JudeHashBrown/righttoken/main/deploy/docker-compose.yml
curl -fsSL -o .env \
  https://raw.githubusercontent.com/JudeHashBrown/righttoken/main/deploy/.env.example

# 自动生成密钥
POSTGRES_PW=$(openssl rand -hex 24)
JWT_SEC=$(openssl rand -hex 32)
TOTP_KEY=$(openssl rand -hex 32)

# 修改 .env
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PW/" .env
sed -i "s/JWT_SECRET=.*/JWT_SEC=$JWT_SEC/" .env
sed -i "s/TOTP_ENCRYPTION_KEY=.*/TOTP_ENCRYPTION_KEY=$TOTP_KEY/" .env

# 提示用户改 admin
echo ""
echo "========================================"
echo "请编辑 /opt/sub2api/.env 修改："
echo "  ADMIN_EMAIL=你的邮箱"
echo "  ADMIN_PASSWORD=你的强密码"
echo "然后跑："
echo "  cd /opt/sub2api && docker compose up -d"
echo "========================================"

chmod 600 .env
```

---

## 写在最后

**保守推进原则**（血泪教训）：

1. **先上小规模测试**：新部署先用 5-10 个自己人 / 内测用户跑 1 周，确认稳定再对外
2. **备份 > 一切**：数据库每日备份，关键 .env 存密码管理器
3. **上游账号别一次性买太多**：先测通 1 个账号，再逐步扩池
4. **教程页写清楚**：客户搞不定的问题 90% 是"我不知道咋配"，好教程比好客服更省事
5. **别自研支付**：接现成的 Stripe / 易支付，别自己写签名验签

有具体环节卡住随时问。祝顺利上线。
