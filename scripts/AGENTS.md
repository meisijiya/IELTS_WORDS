# `scripts/` · Bare-metal bootstrap + production recovery

服务器首次部署 + 生产事故恢复资产。所有 `workflow_dispatch` 触发入口见 `.github/workflows/AGENTS.md`。

## Files

- `/home/ljh2923/opencode-project/English_YASI/scripts/server-bootstrap.sh` — 裸机 → 运行中应用的全自动引导。安装 Docker/nginx/certbot/ufw，`git clone` 项目，自动生成 `POSTGRES_PASSWORD`(20)、`ADMIN_PASSWORD`(16)、`SESSION_SECRET`(base64 32B) 三个强密码写入 `.env`，`docker compose up -d --build`，打印 GH Secrets 配置清单。一次性脚本，**只在全新服务器** 跑一次。
- `/home/ljh2923/opencode-project/English_YASI/scripts/fix-prod-schema.sql` — 生产 DB schema 恢复脚本。`DO $$ ... IF NOT EXISTS` 包裹，幂等可重跑。包含：CREATE TABLE "User"/"Invitation"/"UserWord" + ALTER TABLE 给 `UserSettings`/`Session`/`Attempt`/`Checkin` 加 `userId Int NOT NULL DEFAULT 0`。**仅** 在 `prisma db push` 整体 rollback 后（参见 `CICD.md` 坑 13）触发 `Fix-Prod-Schema` workflow。
- `/home/ljh2923/opencode-project/English_YASI/scripts/migrate-legacy-userdata.sql` — 将 schema 恢复后的 `userId = 0` 占位行重归属到 admin 用户。`UserSettings` 中 `userId = 0` 的行 DELETE（`@unique` 约束），其余表的 `userId = 0` 行 UPDATE 到 admin.id。触发 `Migrate-Legacy-UserData` workflow。

## Boot order

新服务器：`server-bootstrap.sh` 一次性 → 后续 deploy 全走 `Build & Deploy` 自动流程。

事故恢复（schema push 整体 rollback 后）：
1. `Free-Disk` workflow（清磁盘）
2. `Fix-Prod-Schema` workflow（跑 `fix-prod-schema.sql`）
3. `Migrate-Legacy-UserData` workflow（跑 `migrate-legacy-userdata.sql`）
4. `Inspect-Prod-Data` workflow（验证 userId 分布）
5. `Reset-Admin-Password` workflow（如 .admin_password 丢失）

## Network + destructive

`server-bootstrap.sh` 安装系统包并启动 nginx，**会占用 80/443 端口**。`fix-prod-schema.sql` 只在缺失时创建表/列，幂等。`migrate-legacy-userdata.sql` 会 UPDATE/DELETE 生产数据行——**必须**先跑 `Backup-Database` workflow 留一份 `pg_dump`。