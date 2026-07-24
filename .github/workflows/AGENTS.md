# `.github/workflows/` · CI / Deploy / Ops recovery

10 个 workflow。`ci.yml` + `deploy.yml` 是自动触发；其余 8 个 `workflow_dispatch` 手动触发。

## Auto (push-triggered)

- **`ci.yml`** — push main → lint + typecheck + build + vitest + pytest。必须通过才能 deploy。
- **`deploy.yml`** — push main (after CI) → build Docker image → push ACR (`latest` + `short_sha` + `timestamp` 三个 tag) → SSH server `docker compose pull + up -d --force-recreate app` → keep-last-2 image prune (rollback buffer) → health check 5×5s。**禁用 BuildKit cache**（`cache-from: ""` + `cache-to: ""`），避免 stale layer 掩盖 `AUDIO_BUNDLE_URL` 改动。

## Manual (`workflow_dispatch`)

| Workflow | 用途 | 关键 SSH 命令 |
|---|---|---|
| **`Diagnose.yml`** | SSH 跑任意 shell 命令 | `inputs.cmd` 默认 `docker logs --tail 80 yasi-app 2>&1` + `SELECT FROM "User"` |
| **`Free-Disk.yml`** | 释放 docker 磁盘 | `docker rmi -f` 删除所有非当前 running 的 `yasi-words` image + `docker image prune -f --filter "until=24h"` + `docker builder prune -f` |
| **`Fix-Prod-Schema.yml`** | 跑 `scripts/fix-prod-schema.sql` | `git pull` + `docker exec -i yasi-postgres psql < /opt/yasi-words/scripts/fix-prod-schema.sql`（stdin 而非 `-f /host/path`，见 CICD.md 坑 14）+ `docker restart yasi-app` |
| **`Migrate-Legacy-UserData.yml`** | 跑 `scripts/migrate-legacy-userdata.sql` | 同上 stdin 模式跑 + 调 `/api/analytics` 验证 admin 能看到 attempts |
| **`Inspect-Prod-Data.yml`** | 全表按 userId 分组统计 | 查 `User/Attempt/Session/Checkin/UserSettings` + 抽样 5 条 attempt |
| **`Read-Admin-Password.yml`** | 脱敏查看密码 | `cat .admin_password` 前 4 字符 + `***REDACTED***`；`.env` `ADMIN_PASSWORD=<REDACTED>`；容器内 `env` 同样脱敏 |
| **`Reset-Admin-Password.yml`** | PBKDF2 重置 admin 密码 | `docker exec -i -e NEW_PW=... yasi-app node -e "...pdkdf2Sync + prisma.user.updateMany..."` —— 必须 `-e` 显式传 env（见 CICD.md 坑 15）|
| **`Backup-Database.yml`** | 每日 pg_dump 备份 | cron `0 19 * * *` (03:00 Asia/Shanghai) + `workflow_dispatch`；`docker exec yasi-postgres pg_dump ... \| gzip -9` → `/opt/yasi-words/backups/`；保留最近 14 份 |

## SSH pattern

所有手动 workflow 用 `appleboy/ssh-action@v1` 直连 server。**不** `actions/checkout`，因为操作的是 server host 上的 `/opt/yasi-words` 目录（git clone 创建的 working tree，不是 image 内容）。

需要 server-side host 文件的 workflow 第一步必须 `git fetch origin main && git reset --hard origin/main`（见 CICD.md 坑 17）。

## `docker exec psql` 模式

```sh
# 对 — stdin 把 host 文件 pipe 进 container
docker exec -i yasi-postgres psql -U yasi -d yasi_db < /opt/yasi-words/scripts/fix.sql

# 错 — psql 在 container 里看不到 host 路径
docker exec -i yasi-postgres psql -f /opt/yasi-words/scripts/fix.sql
```

## Env pass-through

```sh
# 对
docker exec -i -e NEW_PW="..." yasi-app node -e "..."

# 错 — 宿主 shell 变量不继承
NEW_PW="..." docker exec -i yasi-app node -e "..."  # container 看不到 NEW_PW
```