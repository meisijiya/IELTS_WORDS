# AGENTS.md

## OVERVIEW

Next.js 15 (App Router) + Prisma 的雅思单词拼写训练器。3 个词库（雅思精简 3611 / 雅思完整 7076 / CET-6 5518），US+UK 双口音真人发音，SM-2 简化学习曲线。**多用户系统**：admin 通过一次性邀请码创建账号，所有数据按 userId 隔离。CI/CD 自动 deploy 到腾讯云（GH Actions → 阿里云容器镜像 ACR 个人版）。

`public/audio/` 不在 git，从 release tarball 拉进 image。原 PDF/DOCX 文献在 `resources/` (tracked)。

## STRUCTURE

```text
.
├── src/                 # Next.js app + shared lib + Python parser.py
│   ├── app/             # pages + Client Components + route handlers
│   ├── components/      # cross-page UI
│   └── lib/             # auth, db, 聚合, 快照
├── prisma/              # schema.prisma + idempotent seed.ts
├── seed/                # runtime canonical 词库 JSON (tracked)
├── tools/               # PDF/DOCX ETL + audio
├── audit/               # 数据审计脚本与报告
├── fixtures/            # parser golden/双引擎测试夹具
├── tests/               # Python parser tests
├── resources/           # 原 PDF/DOCX 文献 (tracked)
├── raw/ parsed/ diff/   # gitignored ETL 中间产物
├── public/audio/        # gitignored 音频资产
├── docker/ scripts/     # container entrypoint + 裸机部署
└── .github/workflows/   # CI + deploy
```

## WHERE TO LOOK

| 任务 | 位置 | 关键事实 |
|---|---|---|
| 练习主循环 | `src/app/practice/[wordbook]/practice-client.tsx` | 最大 client file；sessions/words/attempts API |
| Auth gate | `src/lib/auth.ts`, `src/middleware.ts`, `src/lib/api.ts` | Web Crypto HMAC；page + API 双重校验；`requireUser()` 是 route 入口 |
| DB 单例 | `src/lib/db.ts`, `prisma/schema.prisma` | Prisma 单例；schema 是数据模型唯一源 |
| 取词 + 答题 | `src/app/api/words/route.ts`, `src/app/api/attempts/route.ts` | PULL_CONFIG；drill/review 分叉 |
| 三路集合分区 | `src/lib/word-collections.ts` | wrong / learning / mastered |
| 30 天历史 | `src/lib/word-history.ts` | word-level 准确率聚合 |
| Rate limit | `src/lib/rate-limit.ts` | 单进程 Map；多实例部署需要 Redis |
| Checkin snapshot | `src/lib/checkin-snapshot.ts` | reset 前 eager 写盘；masteredTodayCount = promote events in [date, date+1) |
| 排行榜 | `src/lib/leaderboard.ts`, `src/app/leaderboard/`, `src/app/api/leaderboard/` | byRange.today/week/month/all + per-user today detail |
| 用户管理 | `src/app/admin/`, `src/app/api/admin/users/`, `prisma/seed.ts` | admin 改任意用户名 |
| 邀请注册 | `src/app/admin/invites/`, `src/app/api/admin/invites/`, `src/app/register/` | 一次性 code + 7 天过期 |
| PDF 解析 | `src/parser.py`, `tools/parse_full.py` | parser 在 `src/` 不是 `tools/` |
| 词库导入 | `seed/*.json`, `prisma/seed.ts` | concise/full/cet6；upsert 幂等 |
| Deploy | `Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml`, `CICD.md` | 见 PITFALLS 段 |

## CODE MAP

| 中心节点 | 位置 | 作用 |
|---|---|---|
| `isAuthenticated` / `requireUser` | `src/lib/auth.ts`, `src/lib/api.ts` | 所有受保护入口的共享守卫 |
| `PrismaClient` | `src/lib/db.ts` | 单例 — 业务文件不要 `new PrismaClient()` |
| `PracticeClient` | `src/app/practice/[wordbook]/practice-client.tsx` | 练习队列 / 提交 / 提示 / 音频 / streak / word history |
| `GET /api/words` | words/route.ts | review/balanced/new 加权 |
| `POST /api/attempts` | attempts/route.ts | SM-2 简化更新；review 只插 Attempt；firstAttemptedAt 在 create 路径写入 |
| `sameIds` 会话复用 | sessions/route.ts | 同一 word ID 集合（含乱序） |
| schema | `prisma/schema.prisma` | User/Invitation/Wordbook/Word/Session/Attempt/Checkin/UserSettings/UserWord 契约；所有 per-user 数据带 `userId`；`UserSettings.userId` 是 `@unique` |

API + middleware 入口不出现在 import graph 中；按 URL/Next 框架入口理解，不能因调用数低就当死代码。

## CONVENTIONS

- npm；`package-lock.json` 为准。TS strict / ES2022 / `@/*` → `src/*`
- **沿用现有 lint/format 配置，不要新引入** Prettier/Stylelint/Husky 等
- `page.tsx` (Server Component，鉴权 + Prisma + 序列化) 同目录 + `*-client.tsx` (Client 交互)
- 四个词库 slug 共享：`practice` / `wrong-words` / `learning` / `mastered`
- TS 单测与源码同目录 `*.test.{ts,tsx}`；Python parser 测试集中在 `tests/test_parser.py`
- ETL：`extract_full` → `parse_full` → `cross_validate` → `seed_export`
- 开发用 SQLite；Docker entrypoint 临时切 PostgreSQL provider 启动后复原
- **改 `prisma/schema.prisma` 必须 `npx prisma db push`** — 否则新字段 API 抛 P2022 (column does not exist)
- `book_a` / `book_b` 是 PDF 管线内部名 ≠ 用户面 slug `concise` / `full`；CET-6 走独立 DOCX pipeline

## CI/CD PIPELINE

push main → GH Actions runner (`ubuntu-latest`，**禁用 BuildKit cache**) → 推 ACR `latest` tag → deploy job SSH server → `docker pull` + `docker compose up -d`

**BuildKit cache 故意关闭**：`cache-from: type=registry` 会复用 stale layer，掩盖后续 `AUDIO_BUNDLE_URL` 改动。

完整步骤 + 维护 SOP + 坑诊断见 [CICD.md](CICD.md)。

新 session 接手 deploy 时：

```bash
gh run list --limit 5                              # 最近 run 状态
ssh <host> 'cd /opt/yasi-words && docker compose ps'  # server container 状态
ssh <host> 'docker compose exec -T app find /app/public/audio -name "*.mp3" | wc -l'  # 期望 ≥ 20000
```

## PITFALLS（deploy / upgrade 前先扫）

完整 + 修复历史见 [CICD.md](CICD.md) 末尾「我们踩过的 12 个坑」。最常踩的 6 个：

1. **ACR 用户名 ≠ 阿里云账号**。ACR 控制台 → 访问凭证 → 重置独立密码。
2. **`docker compose pull app` silent no-op** 如果 `app` service 没 `image:` 字段。`docker-compose.yml` 必须有 `image: ${APP_IMAGE:-}`，deploy script 设 `APP_IMAGE`。
3. **BuildKit cache 复用 stale layer** — 改了 `AUDIO_BUNDLE_URL` 但 image 仍是旧 audio。已故意关 cache (`deploy.yml`)。
4. **audio bundle > 100 MB 必须 web UI 上传** — GitHub Release Asset API 单文件上限。
5. **Postgres volume 不同步 `.env` 密码** — 手动 `docker compose exec postgres env PGPASSWORD=<old> psql -U yasi -d yasi_db -c "ALTER USER yasi WITH PASSWORD '<new>';"`。
6. **Secure cookie `secure: true` 在 HTTP 部署被浏览器 drop** → login 后 `URL 仍 /login?next=/`（静默失败）。修法：`secure: process.env.AUTH_COOKIE_SECURE === "true"`，HTTP 默认 off。
7. **`prisma db push` 加 NOT NULL 列到已有数据的表失败 → 整个 push rollback**（schema 改动包含同时加 userId 列 + 创建新表时）。`docker/entrypoint.sh` 必须 loud-exit；生产恢复用 `Fix-Prod-Schema` workflow。详细见 `CICD.md` 坑 13。
8. **`docker exec psql -f /host/path` 看不到 host 文件** —— container 内 psql 看不到 host FS。用 stdin `< /host/path` 而不是 `-f /host/path`。详细见 `CICD.md` 坑 14。
9. **`docker exec -e VAR=value`** 必须显式传 env，宿主 shell 变量不继承。详细见 `CICD.md` 坑 15。
10. **server 磁盘被旧 docker image 填满** —— 50GB 满后 `git pull` 报 `No space left on device`。用 `Free-Disk` workflow 清理。详细见 `CICD.md` 坑 16。
11. **`deploy.yml` 不更新 host `/opt/yasi-words/scripts/`** —— 需要 server-side host 文件的 workflow 第一步必须 `git fetch + git reset --hard origin/main`。详细见 `CICD.md` 坑 17。

**新 session 在以下动作前先读 pitfalls**：升级 `deploy.yml` / 改 `AUDIO_BUNDLE_URL` / 改数据库或 admin 密码 / 改 cookie secure / 新建 GitHub Release / **改 `prisma/schema.prisma` 加列或新表** / **生产事故 triage**。

## Schema 升级规范（expand-and-contract）

**核心原则**：**永远不要**在同一次 `prisma db push` 里同时给已有数据的表加 `NOT NULL` 列 + 创建依赖列。Prisma 在 PostgreSQL 上的 `db push` 是单一事务，中间任何 ALTER 失败 → 整个 push rollback → 新表也回滚 → 数据看似"被删"。

**正确流程（三步）**：

1. **Expand**：先加列但 nullable 或带 default：
   ```prisma
   model Session {
     userId Int? @default(0)  // 先 default 0
   }
   ```
   部署 → push 成功（PG 接受 default 0）。

2. **Backfill**：写迁移脚本把所有旧行填真实值：
   ```sql
   UPDATE "Session" SET "userId" = (SELECT id FROM "User" WHERE role='admin') WHERE "userId" = 0;
   ```
   部署 + 跑脚本。

3. **Contract**：再切到 NOT NULL：
   ```prisma
   model Session {
     userId Int  // 去掉 default + ?
   }
   ```
   部署 → push 成功（所有行已有真实 userId）。

**生产 schema 改动 checklist**（改 `prisma/schema.prisma` 加列或新表前必读）：
- [ ] 备份当前 DB（手动跑 `Backup-Database` workflow 或 `pg_dump`）
- [ ] 用 `Migrate-Legacy-UserData` workflow 处理历史行（如果加 userId 之类的归属列）
- [ ] deploy 后用 `Inspect-Prod-Data` workflow 验证行数与 sample
- [ ] 出现 500 时看 server `docker logs yasi-app | grep -i error`

**自动备份**：`Backup-Database` workflow 每天 03:00 Asia/Shanghai 跑 `pg_dump` 到 `/opt/yasi-words/backups/`，保留 14 天。`workflow_dispatch` 可手动触发事故前快照。

**回滚**：deploy.yml 自动保留当前 + 上一个 yasi-words image 作为 rollback buffer；`docker compose up -d app <previous_tag>` 即可回滚。

## ANTI-PATTERNS

- 不要裸跑无 `where` 的 `updateMany({})` / `deleteMany({})`，也不要全表 `psql DELETE`；测试清理必须限定 ID。重置走 `/api/admin/reset`。
- 重置确认短语必须完整匹配：`RESET PROGRESS` / `DELETE ATTEMPTS` / `DELETE SESSIONS` / `RESET EVERYTHING`。
- `Session.mode === "review"` 时只插 Attempt，**不修改** Word 的 attempts / level / correct / masteredAt。
- `UserSettings.enablePronunciation` 已 deprecated；用 `pronunciationMode`。
- 不要提交 `.env`、`public/audio/*.mp3`、`release/*.tgz`（资源 / 音频 / 数据卷都没必要 commit）。
- 部署时不要把 3000 端口直接暴露公网（nginx 反代）；首次登录后删除 `.admin_password`。
- `docker compose down -v` 会清掉 Postgres volume；执行前必须明确接受数据清除。
- 不要在 `raw/`、`parsed/`、`diff/`、`.next/`、`public/audio/`、`release/` 下创建 AGENTS.md（生成物目录，文档归属根）。

## COMMANDS

```bash
npm install
npm run dev | lint | typecheck | test | test:parser | build
npm run db:push | db:seed
npm run gate                # 需要 resources/ 里的 PDF (tracked，所以 CI 可跑)
npm run extract:full         # PDF → raw/
npm run parse:full           # raw/ → parsed/
npm run seed:export          # parsed/ → seed/ (会改 tracked JSON)
docker compose up -d --build | logs -f app | down    # 不带 -v 保留 volume
```

## NOTES

- CI 跑 `lint` / `typecheck` / `build` / Vitest / pytest；`gate` 现在可入 CI（源在 `resources/`），但默认不开。
- Tracked 源数据：`seed/` / `fixtures/` / `resources/`。其它目录都是生成物 / 编译产物。
- 触网脚本：`tools/fetch_pronunciations.py`、`audit/spot-check.py`、release 上传 — 未明确要求不要跑。
