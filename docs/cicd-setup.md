# CI/CD Setup Guide（阿里云 ACR 个人版）

> 适用于阿里云容器镜像服务**个人版**（个人实例）的部署。

## 🎯 整体架构

```
本地 git push
  ↓
GitHub Actions (CI)
  ↓ lint + typecheck + build + parser tests + accuracy gate
GitHub Actions (CD)
  ↓ build docker image
阿里云 ACR 个人版（华南1深圳）
  ↓ crpi-yb995ikg3qabxbs0.cn-shenzhen.personal.cr.aliyuncs.com/meisijiya/yasi-words
腾讯云轻量级服务器（SSH）
  ↓ docker compose pull + up
  ↓ 健康检查
  ↓ ✅ http://<IP>:3000
```

---

## ✅ Step 1：阿里云 ACR 已就绪

仓库已创建：
- **Registry**：`crpi-yb995ikg3qabxbs0.cn-shenzhen.personal.cr.aliyuncs.com`
- **Namespace**：`meisijiya`
- **Repository**：`yasi-words`
- **代码仓库**：`https://github.com/meisijiya/IELTS_WORDS`
- **状态**：✅ 正常

仓库的公网拉取地址：
```bash
docker pull crpi-yb995ikg3qabxbs0.cn-shenzhen.personal.cr.aliyuncs.com/meisijiya/yasi-words:latest
```

---

## ✅ Step 2：创建阿里云 AccessKey（5 分钟）

1. 登录阿里云控制台 https://ram.console.aliyun.com/manage/ak
2. **创建 AccessKey**
   - 用户名：点右上角头像 → AccessKey 管理
   - 或直接访问：https://ram.console.aliyun.com/manage/ak
3. 选择"使用 AccessKey ID 和 Secret 访问"
4. 完成安全验证（手机验证码）
5. **保存**：
   - `AccessKey ID`（如 `nick4319916808`）— 但 GitHub Actions 用的是**阿里云账号 ID**做 username
   - `AccessKey Secret` — 重要！只显示一次

> ⚠️ 阿里云 ACR 个人版的 username 不是 AccessKey ID，而是**阿里云账号 ID**（图片里显示 `nick4319916808`）。
> Password 是 **AccessKey Secret**（不是 AccessKey ID）。

记录：
```
Username (GitHub Secret: ALIYUN_REGISTRY_USERNAME):
  nick4319916808                          ← 你的阿里云账号 ID

Password (GitHub Secret: ALIYUN_REGISTRY_PASSWORD):
  <你创建 AccessKey 时显示的 Secret>       ← 妥善保存
```

---

## ✅ Step 3：服务器配置 SSH Key（5 分钟）

在你的**腾讯云服务器**上：

```bash
# 1. 生成专用 SSH key
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy
# 提示输入密码时直接回车（无密码）

# 2. 把公钥加到 authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 3. 显示 private key 完整内容（复制全部，包括 BEGIN/END 行）
cat ~/.ssh/github_deploy
```

⚠️ **复制完整内容**，包括：
```
-----BEGIN OPENSSH PRIVATE KEY-----
...（多行密钥内容）...
-----END OPENSSH PRIVATE KEY-----
```

---

## ✅ Step 4：添加 GitHub Secrets（10 分钟）

打开 https://github.com/meisijiya/IELTS_WORDS/settings/secrets/actions

点 **"New repository secret"**，逐个添加这 7 个：

| Secret Name | Value（你的实际值） |
|---|---|
| `ALIYUN_REGISTRY` | `crpi-yb995ikg3qabxbs0.cn-shenzhen.personal.cr.aliyuncs.com` |
| `ALIYUN_REGISTRY_NAMESPACE` | `meisijiya` |
| `ALIYUN_REGISTRY_USERNAME` | `nick4319916808`（你的阿里云账号 ID） |
| `ALIYUN_REGISTRY_PASSWORD` | `<你的 AccessKey Secret>` |
| `DEPLOY_HOST` | `<你的服务器公网 IP>` |
| `DEPLOY_SSH_USER` | `root` |
| `DEPLOY_SSH_KEY` | Step 3 复制的完整 private key |

---

## ✅ Step 5：触发首次 CI/CD

打开 https://github.com/meisijiya/IELTS_WORDS/actions

刚 push 的 commit 应该已经触发了 **CI workflow**。如果没看到，可以：

```bash
# 在本地重新触发（任何 commit 都行）
cd /path/to/yasi-words
git commit --allow-empty -m "chore: trigger CI"
git push
```

CI 通过后会自动触发 **Deploy workflow**：
1. Build Docker image → 推送到你的 ACR
2. SSH 到服务器 → `docker compose pull app && docker compose up -d`
3. 健康检查 → `curl http://<IP>:3000/login`

---

## 🚨 常见错误速查

### 错误 1：`unauthorized: authentication required`

```
Error response from daemon: Get "https://crpi-yb...: unauthorized"
```

**原因**：AccessKey ID / Secret 错，或者 username 用错。

**修复**：
- `ALIYUN_REGISTRY_USERNAME` 必须是**阿里云账号 ID**（如 `nick4319916808`），不是邮箱
- `ALIYUN_REGISTRY_PASSWORD` 是 **AccessKey Secret**（不是 AccessKey ID）

### 错误 2：`denied: requested access to the resource is denied`

```
denied: requested access to the resource is denied
```

**原因**：AccessKey 没有该命名空间的写权限。

**修复**：
- 阿里云控制台 → RAM 访问控制 → 用户 → 找到对应账号
- 给该用户授予 `AliyunContainerRegistryFullAccess` 权限

### 错误 3：`ssh: handshake failed`

```
ssh: handshake failed: ssh: unable to authenticate
```

**原因**：SSH private key 配错。

**修复**：
- 重新从服务器 `cat ~/.ssh/github_deploy`
- **完整复制**（包括 BEGIN/END 行）
- 确保 `chmod 600` 文件权限（虽然 GitHub Secret 不需要本地权限）

### 错误 4：服务器 `docker compose pull` 401

```
Error response from daemon: pull access denied for ...
```

**原因**：服务器没登录 ACR。

**修复**：deploy.yml 里我已经加了自动 `docker login`，但要确保 secret 正确。

---

## 🎁 部署后的验证清单

服务器端：
```bash
docker compose ps
# 应该看到 yasi-app + yasi-postgres 都是 Up (healthy)

docker compose logs --tail=30 app
# 应该看到 "Next.js" 启动日志

# 进入容器查看
docker compose exec app sh -c "wget -q -O- http://localhost:3000/login | head -5"
```

浏览器打开 `http://<你的服务器IP>:3000`，登录测试。

---

## 🔄 以后的工作流

```bash
# 本地开发
npm run dev

# 测试 + 类型检查
npm run typecheck
python3 tools/gate.py --sample 200

# 提交 + 推送 → 触发自动部署
git add .
git commit -m "feat: 新功能"
git push

# ☕ 喝杯茶，几分钟后服务器已经跑新代码
```

---

## 📞 卡住了？

遇到任何错误，把 **GitHub Actions 日志**（在 https://github.com/meisijiya/IELTS_WORDS/actions 点对应 run 看）发给我，我帮你排查。