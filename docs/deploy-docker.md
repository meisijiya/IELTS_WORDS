# Docker 部署指南（腾讯云轻量级云服务器）

所有依赖均通过**国内镜像源**拉取，专为国内服务器优化。

## 一键拉起

```bash
# 1. SSH 到服务器
ssh root@<你的服务器IP>

# 2. 安装 Docker（如果还没装）
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 3. 拉取/上传代码（推荐用 Gitee 镜像或 ghproxy 加速）
cd /opt
git clone https://gitee.com/meisijiya/IELTS_WORDS.git yasi-words
# 或 GitHub 直连（如果服务器能访问）：
# git clone https://github.com/meisijiya/IELTS_WORDS.git yasi-words
# 或通过 ghproxy 加速（解决 GitHub 慢/不通的问题）：
# git clone https://ghproxy.com/https://github.com/meisijiya/IELTS_WORDS.git yasi-words
cd yasi-words

# 4. 配置环境变量
cp .env.docker.example .env
nano .env   # 改 POSTGRES_PASSWORD / ADMIN_PASSWORD / SESSION_SECRET

# 5. 一键拉起（首次会构建镜像 + 应用 schema + seed 10,686 词，约 1-3 分钟）
docker compose up -d --build

# 6. 看日志
docker compose logs -f app
```

## 访问

```
http://<服务器IP>:3000
```

首次访问会跳转到 `/login`，输入 `.env` 中的 `ADMIN_PASSWORD`。

## 镜像源（已配置国内源）

所有依赖都通过国内镜像拉取，无需特殊网络配置。

| 用途 | 镜像源 | 备注 |
|---|---|---|
| **Docker 基础镜像** | `registry.cn-hangzhou.aliyuncs.com/library/` | 阿里云 Docker Hub 镜像，覆盖最广 |
| **Alpine apk 包** | `https://mirrors.aliyun.com/alpine/...` | Dockerfile 内自动 sed 替换 |
| **npm 包** | `https://registry.npmmirror.com` | 淘宝镜像，原 npm.taobao.org |
| **GitHub 仓库** | `https://gitee.com/meisijiya/IELTS_WORDS.git` 或 `https://ghproxy.com/...` | Gitee 镜像 / ghproxy 加速 |

### 如果某镜像源挂了

**A. 切换 Docker Hub 镜像** — 编辑 `Dockerfile` 和 `docker-compose.yml`：

```bash
# 选项 1: 腾讯云镜像
sed -i 's|registry.cn-hangzhou.aliyuncs.com|ccr.ccs.tencentyun.com/library|g' Dockerfile docker-compose.yml

# 选项 2: DaoCloud 镜像
sed -i 's|registry.cn-hangzhou.aliyuncs.com|docker.m.daocloud.io/v2/library|g' Dockerfile docker-compose.yml

# 选项 3: 网易
sed -i 's|registry.cn-hangzhou.aliyuncs.com|hub-mirror.c.163.com/library|g' Dockerfile docker-compose.yml

# 重新构建
docker compose up -d --build
```

**B. 切换 npm 镜像** — 编辑 `Dockerfile`：

```bash
# 选项 1: 腾讯云
sed -i 's|registry.npmmirror.com|mirrors.tencentyun.com/npm|g' Dockerfile

# 选项 2: 阿里云（备用）
sed -i 's|registry.npmmirror.com|registry.npm.taobao.org|g' Dockerfile
```

**C. 切换 Alpine apk 源** — 编辑 `Dockerfile`：

```bash
# 选项 1: 腾讯云
sed -i 's|mirrors.aliyun.com|mirrors.cloud.tencent.com|g' Dockerfile

# 选项 2: 中科大
sed -i 's|mirrors.aliyun.com|mirrors.ustc.edu.cn|g' Dockerfile
```

## 日常管理

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f app          # Next.js 应用日志
docker compose logs -f postgres     # 数据库日志

# 重启服务
docker compose restart app

# 重新构建（代码更新后）
docker compose up -d --build

# 停止
docker compose down

# 完全清理（**会删数据**）
docker compose down -v
```

## 🔊 音频文件

`/public/audio/` 是 `.gitignore` 的，**新镜像首次启动时 audio 为空**。

entrypoint 自动检测并下载：

- 检测 `public/audio/*.mp3` 文件数
- **< 1000** → 自动跑 `python3 tools/fetch_pronunciations.py` 下载 US+UK 双口音（约 30 分钟，取决于网速）
- **≥ 1000** → 跳过（audio 已 baked-in 或来自 volume mount）

下载失败的词会被记录到 `public/audio/FAILED.txt`，下次启动可手动重试：

```bash
docker compose exec app python3 tools/fetch_pronunciations.py --limit 0
```

### 加速首次部署（可选）

**方式 A · 用预打包的 audio tarball**：在能访问的机器上下载好 audio，
打包传到服务器，服务器启动时导入。这比让容器内重下要快。

```bash
# 1. 在本地下载 audio（一次性 ~30 min）
python3 tools/fetch_pronunciations.py

# 2. 打包
tar czf audio.tgz public/audio/

# 3. 上传到服务器（任意方式：scp / rclone / OSS / Gitee LFS）
scp audio.tgz root@<服务器IP>:/opt/yasi-words/

# 4. 服务器上解包（容器启动前）
cd /opt/yasi-words
tar xzf audio.tgz public/audio/

# 5. docker compose up，entrypoint 检测到 ≥1000 → 跳过下载
docker compose up -d --build
```

**方式 B · 用 GitHub Release（如果带宽够）**：

- 把 `audio.tgz` 上传到 GitHub Releases（无需 LFS，常规附件支持 2GB）
- 服务器启动时从 release 下载：

```bash
# 在 docker-compose.yml 加一个 init container：
#   - 用 wget 下载 release/audio.tgz 并解包到 named volume
```

**方式 C · 不用任何优化，等 30 分钟**：

- 适合一次性 demo 服务器
- 容器已经在跑了，没人能访问之前 download 就完成
- entrypoint 自动启动时跑，能最多省事

## 反向代理（HTTPS，可选）

```bash
# 在宿主机安装 nginx
apt install -y nginx certbot python3-certbot-nginx

# /etc/nginx/sites-available/yasi-words
server {
    listen 80;
    server_name your-domain.com;  # 或直接写 IP
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

ln -s /etc/nginx/sites-available/yasi-words /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# HTTPS（需要域名）
certbot --nginx -d your-domain.com
```

## 数据备份

```bash
# 手动备份数据库
docker compose exec postgres pg_dump -U yasi yasi_db > /backup/yasi_$(date +%Y%m%d).sql

# 恢复
cat /backup/yasi_20260101.sql | docker compose exec -T postgres psql -U yasi -d yasi_db
```

建议配 cron 自动备份：

```bash
# 每天凌晨 3 点备份，保留 30 天
echo '0 3 * * * cd /opt/yasi-words && docker compose exec -T postgres pg_dump -U yasi yasi_db > /backup/yasi_$(date +\%Y\%m\%d).sql && find /backup -name "yasi_*.sql" -mtime +30 -delete' | crontab -
```

## 升级流程

```bash
cd /opt/yasi-words
git pull                     # 或 scp 覆盖
docker compose up -d --build
docker compose logs -f app   # 确认启动正常
```

数据库变更（schema 变化）会自动通过 `prisma db push` 应用，无需手动 migrate。

## 故障排查

```bash
# 查看 app 容器日志
docker compose logs app --tail=100

# 进入 app 容器调试
docker compose exec app sh
> ls /app
> cat /app/.next/BUILD_ID  # 确认构建版本

# 数据库连接检查
docker compose exec postgres psql -U yasi -d yasi_db -c "SELECT COUNT(*) FROM \"Word\";"

# 如果 npm 镜像挂了
docker compose exec app npm config set registry https://registry.npmmirror.com
docker compose restart app

# 重置密码（修改 .env 后）
docker compose down
# 编辑 .env
docker compose up -d --build
```

## 资源需求

| 资源 | 最小 | 推荐 |
|---|---|---|
| CPU | 1 核 | 2 核 |
| 内存 | 1 GB | 2 GB |
| 硬盘 | 5 GB | 20 GB（备份空间）|
| 带宽 | 1 Mbps | 5 Mbps |

腾讯云轻量级 2C2G 足够。