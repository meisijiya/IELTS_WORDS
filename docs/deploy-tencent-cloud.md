# 部署到腾讯云轻量级云服务器

## 概述

本文档说明如何把 Yasi Words 部署到腾讯云轻量应用服务器（Lighthouse）。

适合用户：希望完全掌控部署、长期使用、不想被 Vercel 等平台锁定。

预计时间：30-60 分钟（不含服务器购买时间）

---

## 1. 购买腾讯云轻量应用服务器

1. 进入腾讯云控制台：https://console.cloud.tencent.com/lighthouse
2. 选择配置：
   - **镜像**：Ubuntu 24.04 LTS（推荐）
   - **规格**：2 核 2GB 内存够用（最便宜档）
   - **带宽**：5 Mbps 足够（个人使用）
   - **系统盘**：50GB SSD（默认）
   - **区域**：选择最近的（影响访问速度）
   - **时长**：按月或按年（建议先按月试用）
3. 付款后等待服务器创建（约 1-3 分钟）
4. 记录：
   - **公网 IP**（如 `123.123.123.123`）
   - **初始密码**（系统会发送站内信或邮件）

---

## 2. SSH 连接到服务器

```bash
# macOS / Linux / WSL2:
ssh root@<公网IP>

# 输入初始密码（首次登录会被要求重置）
```

### 2.1 防火墙设置

腾讯云轻量服务器默认开放 22/80/443 端口，但需要在控制台放行：

1. 进入服务器详情页 → **防火墙** → **添加规则**
2. 添加：
   - 端口 `80`（HTTP，重定向用）
   - 端口 `443`（HTTPS，Let's Encrypt）
   - 端口 `3000`（Next.js，可选，仅内网访问时）

### 2.2 域名解析（可选）

如果有域名，在腾讯云 DNS 解析添加 A 记录指向服务器公网 IP。

---

## 3. 服务器基础环境配置

```bash
# 3.1 更新系统
apt update && apt upgrade -y

# 3.2 安装 Node.js 22（NodeSource）
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 验证
node --version  # 应为 v22.x.x
npm --version

# 3.3 安装 PostgreSQL（生产数据库）
apt install -y postgresql postgresql-contrib

# 3.4 安装 nginx（反向代理）
apt install -y nginx

# 3.5 安装 Python（仅需要做 PDF 解析时）
apt install -y python3 python3-pip python3-venv

# 3.6 安装 certbot（HTTPS）
apt install -y certbot python3-certbot-nginx
```

---

## 4. 配置 PostgreSQL

```bash
# 4.1 切换到 postgres 用户
sudo -u postgres psql

# 4.2 创建数据库和用户
CREATE USER yasi WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';
CREATE DATABASE yasi_db OWNER yasi;
GRANT ALL PRIVILEGES ON DATABASE yasi_db TO yasi;
\q

# 4.3 修改 pg_hba.conf 允许密码认证（如需要）
# 编辑 /etc/postgresql/*/main/pg_hba.conf
# 找到 local all all peer 行，改为 md5
# 重启 PostgreSQL:
systemctl restart postgresql
```

记录 `DATABASE_URL`：
```
DATABASE_URL="postgresql://yasi:YOUR_STRONG_PASSWORD_HERE@localhost:5432/yasi_db"
```

---

## 5. 上传代码

### 方式 A：git clone（推荐）

```bash
# 在服务器上
cd /opt
git clone <your-repo-url> yasi-words
cd yasi-words
```

### 方式 B：scp 上传（本地无 git 仓库）

```bash
# 在本地（你的开发机器）
scp -r ./* root@<公网IP>:/opt/yasi-words/
```

---

## 6. 应用配置

```bash
# 6.1 安装依赖
cd /opt/yasi-words
npm install --production

# 6.2 创建 .env 文件
cat > .env << EOF
DATABASE_URL="postgresql://yasi:YOUR_STRONG_PASSWORD_HERE@localhost:5432/yasi_db"
ADMIN_PASSWORD="<你的强密码>"
SESSION_SECRET="$(openssl rand -base64 32)"
NODE_ENV="production"
EOF

chmod 600 .env
```

### 6.3 切换 Prisma provider 到 PostgreSQL

```bash
# 编辑 prisma/schema.prisma
sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

# 删除旧的 sqlite migration（如有）
rm -rf prisma/migrations

# 生成 PostgreSQL migration
npx prisma migrate dev --name init
# （如果 migrate dev 失败，可改用 db push）
# npx prisma db push
```

### 6.4 导入种子数据

```bash
# Python 解析（如果 seed/ 目录为空）
python3 -m venv .venv
source .venv/bin/activate
pip install -r tools/requirements.txt
npm run extract:full
npm run parse:full
npm run seed:export

# 导入 PostgreSQL
npx tsx prisma/seed.ts
```

### 6.5 构建

```bash
npm run build
```

---

## 7. systemd 服务

```bash
# 7.1 创建服务文件
cat > /etc/systemd/system/yasi-words.service << EOF
[Unit]
Description=Yasi Words - Next.js app
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/yasi-words
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
EnvironmentFile=/opt/yasi-words/.env

[Install]
WantedBy=multi-user.target
EOF

# 7.2 启动并启用
systemctl daemon-reload
systemctl start yasi-words
systemctl enable yasi-words

# 7.3 查看状态
systemctl status yasi-words
```

---

## 8. nginx 反向代理

```bash
# 8.1 创建 nginx 配置
cat > /etc/nginx/sites-available/yasi-words << EOF
server {
    listen 80;
    server_name your-domain.com;  # 改为你的域名或公网 IP

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# 8.2 启用配置
ln -s /etc/nginx/sites-available/yasi-words /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 9. HTTPS（Let's Encrypt）

```bash
# 9.1 申请证书（替换为你的域名）
certbot --nginx -d your-domain.com

# 9.2 自动续期（certbot 已自动配置）
certbot renew --dry-run
```

---

## 10. 验证

```bash
# 10.1 服务状态
systemctl status yasi-words

# 10.2 端口监听
ss -tlnp | grep -E "3000|80|443"

# 10.3 测试访问
curl -I http://your-domain.com/login   # 或 http://<公网IP>/login
```

打开浏览器访问 `http://your-domain.com/login`，输入 `.env` 中的 `ADMIN_PASSWORD` 登录。

---

## 11. 维护

### 查看日志

```bash
journalctl -u yasi-words -f
```

### 更新应用

```bash
cd /opt/yasi-words
git pull  # 如果用 git
npm install --production
npm run build
systemctl restart yasi-words
```

### 备份数据库

```bash
# 创建备份
sudo -u postgres pg_dump yasi_db > /backup/yasi_$(date +%Y%m%d).sql

# 恢复
sudo -u postgres psql yasi_db < /backup/yasi_20260101.sql
```

建议用 cron 自动备份：

```bash
# 每天凌晨 3 点备份，保留 30 天
0 3 * * * sudo -u postgres pg_dump yasi_db > /backup/yasi_$(date +\%Y\%m\%d).sql && find /backup -name "yasi_*.sql" -mtime +30 -delete
```

---

## 常见问题

### Q: 启动失败，提示 `EADDRINUSE`

```bash
# 查看占用 3000 端口的进程
ss -tlnp | grep 3000
# 杀掉它
fuser -k 3000/tcp
# 重启服务
systemctl restart yasi-words
```

### Q: 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
systemctl status postgresql
# 检查 .env 中的 DATABASE_URL 是否正确
cat /opt/yasi-words/.env
# 测试连接
psql "postgresql://yasi:YOUR_PASSWORD@localhost:5432/yasi_db"
```

### Q: Prisma 报错 `Cannot find module`

```bash
cd /opt/yasi-words
npx prisma generate
npm run build
systemctl restart yasi-words
```

### Q: 忘记 ADMIN_PASSWORD

```bash
# 临时绕过：直接编辑 .env 重置密码
sed -i 's/ADMIN_PASSWORD=.*/ADMIN_PASSWORD="newpassword"/' /opt/yasi-words/.env
systemctl restart yasi-words
```

---

## 费用估算（参考）

| 项目 | 月费用 |
|---|---|
| 腾讯云轻量 2C2G | ~¥50-80 |
| 域名（可选） | ~¥50-80/年 |
| Let's Encrypt | 免费 |
| **合计** | **~¥60-90/月** |

---

## 备份策略建议

1. **数据库**：每天 cron 自动备份到 `/backup/`，保留 30 天
2. **代码**：用 git 仓库托管（GitHub/Gitee 私有仓库）
3. **.env**：本地保存副本（不要提交到 git）
4. **快照**：腾讯云控制台可创建系统盘快照（每周一次，~¥5-10/月）