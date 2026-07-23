# CI/CD 与部署手册

> 把 Yasi Words 项目用 **GitHub Actions → 阿里云容器镜像服务 (ACR) → 云服务器** 端到端自动部署的全过程记录下来。
>
> 如果你只是想用这个项目，按 [README](README.md) 走；如果你想理解 / fork / 改 CI/CD 配置，继续往下读。

---

## 0 · 一图胜千言

```
                     ┌──────────────────────────────────────────┐
                     │  本地                                    │
                     │  git push origin main                     │
                     └────────────────┬─────────────────────────┘
                                      │ HTTPS push
                                      ▼
       ┌──────────────────────────────────────────────────────┐
       │  GitHub                                               │
       │    • 触发 Actions (.github/workflows/deploy.yml)      │
       │    • GitHub-hosted runner: ubuntu-latest             │
       │      ├─ docker/build-push-action                     │
       │      │   • BuildKit buildx build .                   │
       │      │   • tag:  meisijiya/yasi-words:<sha>          │
       │      │   • tag:  meisijiya/yasi-words:latest          │
       │      └─ docker push 到 ACR  ─────────────────────┐   │
       │                                                  │   │
       │    • deploy job (需要 build-and-push 成功)         │   │
       │      └─ appleboy/ssh-action  SSH 进 server         │   │
       └──────────────────────────────┬───────────────────┘   │
                                      │                       │
                                      ▼                       ▼
       ┌──────────────────────────────────┐    ┌──────────────────────────────┐
       │  云服务器 (ubuntu)               │    │  阿里云容器镜像服务 ACR       │
       │    /opt/yasi-words               │    │    个人版 (cn-shenzhen 等)   │
       │      • docker-compose.yml        │    │    namespace: meisijiya      │
       │      • .env (3 个强密码)         │    │    repo:      yasi-words     │
       │      • audio_data named volume   │    │                              │
       │                                  │    │    images:                    │
       │    ┌──────────────────────────┐  │    │    • :latest (部署用)        │
       │    │  yasi-app  (Next.js 15)  │  │    │    • :<sha>    (历史)         │
       │    │  yasi-postgres  (16)     │◀─┼────┤    • :<ts>     (历史)         │
       │    └──────────────────────────┘  │    └──────────────────────────────┘
       │       ↑                          │
       │       │ docker pull APP_IMAGE    │
       │       │ docker compose up -d     │
       └───────┼──────────────────────────┘
               │
        浏览器 → http://<server-ip>:3000/login
```

---

## 1 · 一次性配置

只做一次。文档后面所有「手动跑一下」都是指这些步骤。

### 1.1 创建阿里云容器镜像服务 ACR（个人版）

打开 <https://crp.console.aliyun.com/> → 个人版 → 创建一个仓库。

| 字段 | 值 |
|---|---|
| 仓库名 | `yasi-words`（与 `docker-compose.yml` 里 image namespace 一致） |
| 地域 | 选离你最近的：**cn-shenzhen**（深圳）/ **cn-hangzhou**（杭州）/ **cn-beijing**（北京） |
| 类型 | 公开（私有也行，但 push 要登录） |
| 代码源 | 选「GitHub」（仅展示用，可选） |

仓库创建后，会显示两个地址：
- **公网地址**：`crpi-xxx.cn-shenzhen.personal.cr.aliyuncs.com` ← 用这个
- VPC 内网：仅 ECS 内网用

**访问凭证**（重点 — 跟阿里云登录密码不一样）：

1. 仓库详情页 → 「访问凭证」
2. **用户名**：阿里云账号全名（纯数字 ID 或带后缀，如 `nick123456789`）
3. **密码**：独立设置。这里需要「**重置密码**」，保存到密码管理器。

> ⚠️ 用户名是 ACR 用户名（账号全名），密码是 ACR 密码（独立设置的）。**这两个都不是你的阿里云登录账号和密码**。

### 1.2 在 GitHub 仓库配置 7 个 Secrets

位置：`https://github.com/<owner>/<repo>/settings/secrets/actions` → **New repository secret**。

| Secret 名 | 值 | 失败症状（漏配或错配时） |
|---|---|---|
| `ALIYUN_REGISTRY` | `crpi-xxx.cn-shenzhen.personal.cr.aliyuncs.com` | pull / push 都 401 |
| `ALIYUN_REGISTRY_NAMESPACE` | `meisijiya`（你在 ACR 创建的命名空间） | image name 错，pull 找不到 |
| `ALIYUN_REGISTRY_USERNAME` | ACR 访问凭证的用户名（账号全名） | docker login 401 |
| `ALIYUN_REGISTRY_PASSWORD` | ACR 访问凭证的密码（独立设置） | docker login 401 |
| `DEPLOY_HOST` | 服务器公网 IP / 域名 | deploy job SSH 失败 |
| `DEPLOY_SSH_USER` | `ubuntu` 或 `root`（你服务器上的 SSH 用户） | **漏配 → workflow 默认 `root` → Permission denied** |
| `DEPLOY_SSH_KEY` | 私钥全文（含 `-----BEGIN OPENSSH PRIVATE KEY-----` 那行） | deploy job SSH 失败 |

**没有 `DEPLOY_SSH_USER` 默认值**：强烈建议显式配，避免 fallback 到 root 引发认证失败。

### 1.3 云服务器初始化（一次性 SSH 跑完）

SSH 登入服务器（首次用阿里云 / 腾讯云控制台的密码）：

```bash
ssh root@<server-ip>

# 1. 安装 Docker（如果镜像模板已带 Docker，跳过）
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh --mirror Aliyun

# 2. 把 ubuntu 用户加入 docker 组（如果你用非 root 跑 Docker）
sudo usermod -aG docker ubuntu

# 3. 配置国内镜像加速器（避免 docker.io 直接拉超慢）
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "registry-mirrors": ["https://mirror.ccs.tencentyun.com"]
}
EOF
sudo systemctl restart docker

# 4. 创建部署目录（路径在 .github/workflows/deploy.yml 里硬编码）
sudo mkdir -p /opt/yasi-words
sudo chown $USER:$USER /opt/yasi-words
cd /opt/yasi-words

# 5. 拉代码
git clone https://github.com/<owner>/<repo>.git .

# 6. 写 .env（用 openssl 生成强密码）
cat > .env <<EOF
POSTGRES_USER=yasi
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
POSTGRES_DB=yasi_db
ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
SESSION_SECRET=$(openssl rand -base64 48)
APP_PORT=3000
TZ=Asia/Shanghai
AUDIO_BUNDLE_URL=https://github.com/<owner>/<repo>/releases/download/<tag>/audio.tgz
EOF

# 7. **关键**：.env 加进 .gitignore（项目已经配置）
grep -E "^\.env$" .gitignore || echo ".env" >> .gitignore

# 8. 重连让 docker 组生效（或者新 shell）
exit
ssh ubuntu@<server-ip> "docker --version && docker compose version"
```

### 1.4 在本地生成 SSH keypair 给 GitHub Actions

**重要：在本机（不是服务器）生成**。

```bash
# 在你的本地 WSL2 / macOS / Linux 终端
ssh-keygen -t edicaid -C "github-deploy-yasi" -f ~/.ssh/yasi_deploy
# 不要 passphrase（或者记下来）

# 公钥 → 服务器 authorized_keys
ssh-copy-id -i ~/.ssh/yasi_deploy.pub ubuntu@<server-ip>

# 测试免密登录
ssh -i ~/.ssh/yasi_deploy ubuntu@<server-ip> "echo OK"

# 私钥全文 → GitHub Secret DEPLOY_SSH_KEY
cat ~/.ssh/yasi_deploy  # 整段（包含 BEGIN/END 行）
```

### 1.5 首次部署的「postgres volume 同步密码」陷阱

postgres volume 持久化的是首次 initdb 时的密码。`.env` 里 `POSTGRES_PASSWORD` 改了，**不会自动同步**到 volume。

⚠️ 第一次我们让 .env 里有不同的 password，postgres 容器还能起来（因为它是 volume 启动的），但 app 容器去连会报 `password authentication failed`。

**做法**：先用 docker-compose 跑起来 postgres，再用旧密码登录，ALTER USER：

```bash
# 1. 让 postgres 容器先起来
cd /opt/yasi-words
docker compose up -d postgres

# 2. 看 postgres 启动日志里的初始密码
docker compose logs postgres | grep -E "PASSWORD|initdb" | head -5

# 3. 用旧密码连进去，把 yasi 用户密码改成 .env 里的
docker compose exec postgres env PGPASSWORD=<旧密码> psql -U yasi -d yasi_db \
  -c "ALTER USER yasi WITH PASSWORD '<.env 里的 POSTGRES_PASSWORD>';"

# 4. 现在再 up app（用 docker compose，会跑 entrypoint）
docker compose up -d

# 5. 验证
docker compose ps
curl http://localhost:3000/login
```

或者**最简单方案**：第一次让 `.env` 用默认 placeholder，部署跑通后，再改 `.env` 强密码，按上面 ALTER USER 同步。

### 1.6 腾讯云 / 阿里云 安全组

| 端口 | 协议 | 来源 | 用途 |
|---|---|---|---|
| 22 | TCP | 0.0.0.0/0 | SSH（最好限自己 IP） |
| 3000 | TCP | 0.0.0.0/0 | 应用（首次验证，生产环境建议 nginx + 443） |

---

## 2 · CI/CD Workflow 拆解

文件：`.github/workflows/deploy.yml`。

```yaml
on:
  push:
    branches: [main]   # 仅 main 分支 push 触发
  workflow_dispatch:    # 允许手动触发
```

### 2.1 `build-and-push` job（在 GitHub 云的 runner 上跑）

```
runs-on: ubuntu-latest
```

步骤：
1. `actions/checkout@v4` — 拉源码（默认浅克隆，足够 build）
2. `docker/setup-buildx-action@v3` — 启用 BuildKit
3. `docker/login-action@v3` — 用 secrets 登录 ACR
4. `Extract version` — 取 sha + 时间戳，写 output
5. `docker/build-push-action@v6` — build image + push 三个 tag：
   - `meisijiya/yasi-words:latest`（deploy job 用）
   - `meisijiya/yasi-words:<short-sha>`（历史回滚）
   - `meisijiya/yasi-words:<timestamp>`（历史）
6. cache 用 `type=inline`（OCI 标准，ACR 能收）

### 2.2 `deploy` job（SSH 到服务器跑 `docker pull` + `up`）

```
runs-on: ubuntu-latest
needs: build-and-push
```

`appleboy/ssh-action@v1` SSH 进 server，跑这个脚本：

```bash
set -e
cd /opt/yasi-words

# 1. login 到 ACR（让 server 能 pull image）
echo "$ALIYUN_REGISTRY_PASSWORD" | docker login \
  -u "$ALIYUN_REGISTRY_USERNAME" \
  --password-stdin "$ALIYUN_REGISTRY"

# 2. 关键：export APP_IMAGE 让 docker-compose 用上 image 字段
export APP_IMAGE="$ALIYUN_REGISTRY/$ALIYUN_REGISTRY_NAMESPACE/yasi-words:latest"

# 3. pull（不是 fallback rebuild！）
docker pull "$APP_IMAGE"
docker compose pull app

# 4. 重启容器
docker compose up -d --force-recreate app

# 5. 清理 24 小时前的旧 image
docker image prune -f --filter "until=24h"
```

外加一个 `Health check` step：5 次 sleep + curl，超时 1 分钟。

### 2.3 为什么 `docker-compose.yml` 必须加 `image:` 字段

如果 `app` service 只有 `build:` 没有 `image:`：

```yaml
app:
  build:
    context: .
    ...
```

那 `docker compose pull app` 永远「No image to be pulled」silently skip。`docker compose up --force-recreate` 会用 `build:` 段**在 server 上重新 build**，完全绕过 ACR。

**修复**（在 docker-compose.yml）：

```yaml
app:
  # Deploy 时 APP_IMAGE=ACR tag → 真的 pull；本地 dev 不设 → fallback 到 build:。
  image: ${APP_IMAGE:-}
  build:
    context: .
    ...
```

---

## 3 · 日常使用

### 3.1 一行触发 deploy

```bash
git add .
git commit -m "feat: ..."
git push origin main
```

5-6 分钟后，server 用新版本。

### 3.2 手动触发

GitHub → Actions → Build & Deploy → 右上角 **Run workflow** → 选 main 分支。

### 3.3 重跑失败的 run

GitHub Actions → 失败的 run → 右上角 **Re-run jobs**。

### 3.4 回滚到上一个正常版本

ACR 保留所有 `:sha` tag，回滚很容易：

```bash
ssh ubuntu@<server-ip>
cd /opt/yasi-words

# 找一个 known-good 的 sha
export APP_IMAGE="$ALIYUN_REGISTRY/meisijiya/yasi-words:<old-sha>"
docker pull "$APP_IMAGE"
docker compose up -d --force-recreate app
```

---

## 4 · 我们踩过的 12 个坑

按发现问题的时间顺序。

### 坑 1 — ACR 用户名 ≠ 阿里云账号

**症状**：`unauthorized: authentication required`
**原因**：误把阿里云账号密码当 ACR 密码。
**修**：阿里云 ACR 个人版 → 「访问凭证」→ 重置密码；用户名为账号全名。

### 坑 2 — `cache-to` 推 cacheconfig.v0 被 ACR 拒

**症状**：`denied: unknown manifest class for application/vnd.buildkit.cacheconfig.v0`
**原因**：`cache-to: type=registry` 写 BuildKit cache 当 OCI artifact，ACR 不认。
**修**：`cache-to: type=inline`（cache 嵌进 image，OCI 标准）。

### 坑 3 — 阿里云 `library/postgres` 镜像路径不通

**症状**：`pull access denied for registry.cn-hangzhou.aliyuncs.com/library/postgres`
**原因**：`library/` 镜像加速已下线。
**修**：所有 `image:` 和 `FROM` 改 docker hub 官方名（`postgres:16-alpine` / `node:22-alpine`），docker daemon 加 `registry-mirrors: ["https://mirror.ccs.tencentyun.com"]`。

### 坑 4 — `docker compose pull` 永远是 no-op

**症状**：CI/CD 全绿，但 server 上代码不变。
**原因**：`app` service 只有 `build:` 没 `image:`，pull 触发 silent skip。
**修**：见第 2.3 节，加 `image: ${APP_IMAGE:-}`。

### 坑 5 — BuildKit 拒绝 shell redirect

**症状**：`'/2>/dev/null': not found`
**原因**：`COPY --from=builder /app/public ./public 2>/dev/null || true` 用 shell 重定向，BuildKit 严格 validator 拒绝。
**修**：删 `2>/dev/null || true`，builder 阶段加 `RUN mkdir -p /app/public` 确保目录存在。

### 坑 6 — Cookie Secure flag 在 HTTP 部署被 drop

**症状**：登录后 URL 仍是 `/login?next=%2F`，前端无报错。
**原因**：`secure: process.env.NODE_ENV === "production"` 让 cookie 带 Secure 标志，HTTP 下浏览器不存。
**修**：`secure: process.env.AUTH_COOKIE_SECURE === "true"`（HTTPS 时显式开）。

### 坑 7 — Postgres volume 不随 .env 同步密码

**症状**：`password authentication failed for user "yasi"`。
**原因**：volume 存首次 initdb 时的密码，`.env` 改了不自动同步。
**修**：用旧密码连 postgres，`ALTER USER yasi WITH PASSWORD '<新密码>'`。详见 1.5 节。

### 坑 8 — Audio bundle 在 build 时拉不到

**症状**：所有 `/audio/*.mp3` 404。
**原因**：GitHub Actions runner 上 `curl https://github.com/.../audio.tgz` 失败（5 分钟超时），image 里 audio 目录为空。
**修**：
- `docker-compose.yml` 加 `audio_data` named volume 持久化
- `entrypoint.sh` 在 audio 目录为空且 `AUDIO_BUNDLE_URL` 非空时 runtime fetch

### 坑 9 — `DEPLOY_SSH_USER` 漏配默认 root

**症状**：`Permission denied (publickey)`。
**原因**：`username: ${{ secrets.DEPLOY_SSH_USER || 'root' }}` 漏配时 fallback 到 root，但你的密钥只给 ubuntu。
**修**：必须显式加 `DEPLOY_SSH_USER=ubuntu`。

### 坑 10 — `args:` 块只有注释被 strict validator 拒绝

**症状**：`services.app.build.args must be a mapping`。
**原因**：YAML 解析空 mapping 失败。
**修**：要么放真 key-value（`AUDIO_BUNDLE_URL: ${AUDIO_BUNDLE_URL:-}`），要么 `args: {}`。

### 坑 11 — `/opt/yasi-words` 路径硬编码

**症状**：项目 clone 在 `~/projects/...`，workflow `cd /opt/yasi-words` 失败。
**修**：固定在 `/opt/yasi-words`（在 server 上 `sudo mkdir -p`）。未来可以参数化。

### 坑 12 — `/favicon.ico` 404

**症状**：浏览器 console noise，无功能影响。
**修**：`src/app/icon.png` 放 32×32 PNG，Next.js 自动作为 favicon。

### 坑 13 — `prisma db push` 在已有数据的表上加 NOT NULL 列失败 → **整个 push rollback**

**症状**：上线多用户系统后，生产 admin 登录报 500。`docker logs yasi-app` 显示 `PrismaClientKnownRequestError: The table 'public.User' does not exist in the current database.`

**根本原因**：Prisma 在 PostgreSQL 上的 `db push` 是**单一事务**。当 schema 改动包含：
- 给旧表（`Session` / `Attempt` / `Checkin` / `UserSettings`）加 `userId Int NOT NULL` 列
- + 同时创建新表（`User` / `Invitation` / `UserWord`）

PostgreSQL 拒绝给已有数据的表加 NOT NULL 列无 default value → 中间步骤失败 → **整个事务 rollback** → 新表也回滚 → 整个 push 0 效果。

entrypoint 的 `|| true` 把这个错误吞掉了 → admin bootstrap 静默失败 → 用户看到 500。

**为什么"看起来"数据被删了**：实际上**数据没动**，但 `public.User` 表**根本就没创建成功**。运维直觉会误以为数据丢了，其实是 schema 整个未应用。

**修**：

1. **首次 schema 加 userId 列必须带 default value**（schema 应写成 `userId Int @default(0)` 然后迁移脚本改成真值），或者用一次性 backfill 脚本预先填 `userId = 0`。
2. **entrypoint 失败时 loud-exit**（去掉 `|| true`），让 push 错误直接 fail container，CI/CD health check 自然 catch。
3. **建立 production schema recovery 脚本**（`scripts/fix-prod-schema.sql`）—— idempotent CREATE + ALTER，可用 `Fix-Prod-Schema` workflow 手动触发。
4. **建立事后 reset 流程**（`Reset-Admin-Password` workflow）—— 在 app container 内跑 PBKDF2 hash + Prisma update，绕过 entrypoint 直接修 admin 密码。

**新 workflow（2026-07-23 增加）**：
- `Diagnose` —— SSH 跑任意 shell 命令看 server 状态
- `Free-Disk` —— 删旧 docker image 释放磁盘
- `Fix-Prod-Schema` —— `git pull` + `docker exec psql < scripts/fix-prod-schema.sql`（注意 **stdin 而非 `-f /host/path`**，见坑 14）
- `Read-Admin-Password` —— 看 `.admin_password` / `.env`（脱敏）
- `Reset-Admin-Password` —— PBKDF2 重置 admin 密码

### 坑 14 — `docker exec psql -f /host/path` 找不到文件

**症状**：`psql: error: /opt/yasi-words/scripts/fix-prod-schema.sql: No such file or directory`，但 `ls -la` 显示文件就在 server host 上。

**根本原因**：`docker exec` 在 container **内部** 执行 psql。`-f /opt/yasi-words/...` 是 host 路径，但 psql 在 container 里只能看到自己的文件系统。

**修**：用 stdin 重定向把 host 文件喂进 container：

```sh
# 错 — psql 在 container 里看不到 host 路径
docker exec -i yasi-postgres psql ... -f /opt/yasi-words/scripts/fix.sql

# 对 — stdin 把文件内容 pipe 进去
docker exec -i yasi-postgres psql ... < /opt/yasi-words/scripts/fix.sql
```

### 坑 15 — `docker exec -e` 不继承宿主 env，必须显式传

**症状**：`Reset-Admin-Password` workflow 报 `password too short`，但 input 明明传了 8 位密码。

**根本原因**：bash 脚本里的 `NEW_PW="$X"` 是宿主 shell 变量，不会自动传入 `docker exec` 启动的 container。`docker exec -e NEW_PW=...` 必须显式写。

**修**：所有要传给 container 的 env 必须出现在 `docker exec -e` 后：

```sh
# 错 — NEW_PW 是宿主变量，container 看不到
NEW_PW="Admin@2026" docker exec -i yasi-app node -e "..."

# 对
docker exec -i -e NEW_PW="Admin@2026" yasi-app node -e "..."
```

### 坑 16 — Server 磁盘被旧 docker image 填满，git pull 失败

**症状**：deploy 看起来成功，但 `fix-prod-schema.yml` 第一步 `git fetch` 报 `fatal: write error: No space left on device`。

**根本原因**：每次 deploy GH Actions push 3 个 tag (`latest` + `short_sha` + `timestamp`)，旧的 `timestamp` tag 永远占着不释放。50GB 磁盘满后连 git 都写不了。

**修**：

1. **`Free-Disk` workflow** —— 手动保留当前 running image，删其他全部 `yasi-words:*` image + dangling + build cache（28GB 释放）。
2. **未来改进**：deploy.yml 加 `docker image prune -f --filter "label=stage=built"` 清理 7 天前的同 repo image。

### 坑 17 — deploy.yml `cd /opt/yasi-words` 但 server 上 `scripts/` 不会自动更新

**症状**：`Fix-Prod-Schema` workflow 报 `scripts/fix-prod-schema.sql: No such file or directory`，即使文件已经 commit 到 main。

**根本原因**：deploy.yml 只 `docker pull` 新 image + `up -d`，**不**更新 server host 上的 `/opt/yasi-words/scripts/` 目录（这是初始 `git clone` 创建的工作树，不是 image 内容）。

**修**：所有需要 server-side host 文件的 workflow 第一步必须 `git fetch + git reset --hard origin/main`。

---

## 5 · 故障排查速查

```bash
# 看 workflow 最近状态
gh run list --limit 5

# 看单次 run 详细日志
gh run view <id> --log

# 看 server 上镜像（确认 deploy 拉了新 image）
ssh ubuntu@<server-ip> "docker images | grep yasi"

# 看 server 容器状态
ssh ubuntu@<server-ip> "cd /opt/yasi-words && docker compose ps"

# 看 entrypoint / app 日志
ssh ubuntu@<server-ip> "cd /opt/yasi-words && docker compose logs --tail 50 app"

# 本机直接测 3000 端口
ssh ubuntu@<server-ip> "curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/login"

# 手动重现 deploy（绕过 CI/CD）
ssh ubuntu@<server-ip> "cd /opt/yasi-words && \
  export APP_IMAGE=ACR_REGISTRY/meisijiya/yasi-words:latest && \
  docker pull \$APP_IMAGE && \
  docker compose pull app && \
  docker compose up -d --force-recreate app"

# 强制 clean rebuild（绕过 cache）
# GitHub Actions run page → Re-run jobs → 勾选「Force rebuild without cache」

# 看 ACR 镜像列表（用 aliyun CLI）
aliyun cr ListRepositoryTag --RegionId cn-shenzhen \
  --Namespace meisijiya --RepositoryName yasi-words
```

---

## 6 · 高级配置（可选）

### 6.1 HTTPS / Nginx 反代

不要让 3000 端口直接暴露公网。nginx 终结 TLS，再反向代理到 app 容器：

```nginx
# /etc/nginx/sites-available/yasi-words
server {
  server_name words.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

HTTPS 部署下，`.env` 加 `AUTH_COOKIE_SECURE=true` 恢复 secure cookie。

### 6.2 私有 ACR 镜像代理

国内拉 docker.io 慢，可以把基础镜像同步到 ACR private：

```bash
docker pull postgres:16-alpine
docker tag postgres:16-alpine $ALIYUN_REGISTRY/meisijiya/postgres:16-alpine
docker push $ALIYUN_REGISTRY/meisijiya/postgres:16-alpine
```

然后 `docker-compose.yml` 和 `Dockerfile` 都用 ACR 地址。

### 6.3 Self-hosted runner（解决 ACR 兼容 + 网络问题）

GitHub-hosted runner 国内访问部分 ACR / GitHub Release 不稳。把 runner 装到云服务器上：

```bash
# GitHub → Settings → Actions → Runners → New self-hosted runner
# 跟着步骤在服务器跑一遍
./config.sh --url https://github.com/<owner>/<repo> --token <TOKEN>

# 然后改 workflow
runs-on: self-hosted
```

### 6.4 多实例部署

`docker-compose.yml` 加 `deploy.replicas: 3`，nginx upstream 做 LB。横向扩到 2-3 实例足够个人项目用。

---

## 7 · 参考命令速查

```bash
# 生成强密码（3 种）
openssl rand -base64 48 | tr -d '/+='
openssl rand -hex 32
head -c 24 /dev/urandom | base64

# GitHub repo secrets（用 gh CLI）
gh secret set ALIYUN_REGISTRY --body "crpi-xxx..."
gh secret list

# 强制重 build（带 fresh cache）
gh workflow run deploy.yml

# 取消正在跑的 workflow
gh run cancel <id>

# 查看 ACR image 列表
docker login ACR_REGISTRY -u USERNAME -p PASSWORD
curl -s "https://ACR_REGISTRY/v2/meisijiya/yasi-words/tags/list" \
  -u "$USERNAME:$PASSWORD" | jq .
```

---

## 8 · 这个项目实际的最终配置

我们实际上跑通过的版本是这些文件（commit `9693f6b`，参考用）：

- `.github/workflows/deploy.yml` — build + deploy job
- `docker-compose.yml` — `image: ${APP_IMAGE:-}` + `audio_data` volume
- `docker/entrypoint.sh` — schema push + seed + audio runtime fetch
- `src/app/api/auth/login/route.ts` — `secure: process.env.AUTH_COOKIE_SECURE === "true"`
- `Dockerfile` — `node:22-alpine` + `mkdir -p /app/public` + 健康 `COPY`

后续改动请保持这 4 个文件的耦合关系一起改。

— 完 —
