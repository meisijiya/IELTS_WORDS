# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-22
**Commit:** f679a53
**Branch:** main

## OVERVIEW
Yasi Words 是 Next.js 15 App Router + TypeScript 5/React 19 的雅思单词拼写训练器。运行时使用 Prisma（本地 SQLite，Docker/生产 PostgreSQL），Python 工具链负责 PDF/DOCX 解析、词库校验和音频准备。

## STRUCTURE
```text
.
├── src/                 # Next.js 应用、共享逻辑，以及 Python parser.py
│   ├── app/             # 页面、Client Components、API route handlers
│   ├── components/      # 跨页面 UI
│   └── lib/             # auth、db、聚合与快照
├── prisma/              # schema.prisma + 幂等 seed.ts
├── seed/                # 运行时 canonical 词库 JSON（tracked）
├── tools/               # PDF/DOCX ETL、gate、音频工具
├── audit/               # 数据审计脚本与报告
├── fixtures/            # parser golden/双引擎测试夹具（tracked）
├── tests/               # Python parser 测试
├── raw/ parsed/ diff/   # gitignored 的 ETL 中间产物
├── public/audio/        # gitignored、可再生的音频资产
├── docker/ scripts/     # 容器入口与裸机部署
└── .github/workflows/   # CI 与部署
```

## WHERE TO LOOK
| 任务 | 位置 | 关键事实 |
|---|---|---|
| 练习状态机、拼写、音频 | `src/app/practice/[wordbook]/practice-client.tsx` | 最大客户端文件；调用 sessions/words/attempts API |
| 认证与会话 cookie | `src/lib/auth.ts`, `src/middleware.ts` | Web Crypto HMAC；Edge-safe；页面/API 双重校验 |
| 数据库访问 | `src/lib/db.ts`, `prisma/schema.prisma` | Prisma 单例；schema 是数据模型唯一源 |
| 加权取词与答题语义 | `src/app/api/words/route.ts`, `src/app/api/attempts/route.ts` | PULL_CONFIG；drill/review 分叉 |
| 错题/学习/掌握集合 | `src/lib/word-collections.ts`, `src/lib/word-history.ts` | 三路互斥分区与 30 天聚合 |
| PDF 解析 | `src/parser.py`, `tools/parse_full.py` | parser 在 `src/`，不是 `tools/`；由 pytest 夹具锁定 |
| 词库导入 | `seed/*.json`, `prisma/seed.ts` | `concise`、`full`、`cet6`；upsert 幂等 |
| 部署 | `Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml` | provider 临时切换、db push、seed、可选音频 bake-in |

## CODE MAP
| 中心节点 | 位置 | 作用/影响 |
|---|---|---|
| `isAuthenticated` | `src/lib/auth.ts` | codegraph 约 16 个调用者；所有受保护入口的共享守卫 |
| `PrismaClient` 单例 | `src/lib/db.ts` | 约 18 个导入者；不要在业务文件中重复 `new PrismaClient()` |
| `PracticeClient` | `src/app/practice/[wordbook]/practice-client.tsx` | 练习队列、提交、提示、音频和 streak 的事实主循环 |
| `GET` words | `src/app/api/words/route.ts` | review/balanced/new 加权拉取与 fallback |
| `POST` attempts | `src/app/api/attempts/route.ts` | SM-2 简化更新；review 只记录 Attempt |
| `sameIds` 会话复用 | `src/app/api/sessions/route.ts` | 同一 word ID 集合（含乱序）避免重复会话 |
| schema | `prisma/schema.prisma` | Wordbook/Word/Session/Attempt/Checkin/UserSettings 数据契约 |
| parser | `src/parser.py` | PDF 行分类与释义解析；Python 测试唯一核心入口 |

Next.js 的 route/page 入口不会完整显示在普通 import 图中；API 与 middleware 必须按 URL/框架入口理解，不能因图中调用数低而当作死代码。

## CONVENTIONS
- 包管理器是 npm；以 `package-lock.json` 为准。TypeScript `strict: true`、ES2022、`@/*` 映射到 `src/*`。
- 没有 Prettier、Stylelint、Husky 或 pytest 配置；不要凭空引入项目未采用的格式化/钩子约定。
- 页面通常是薄的 Server Component `page.tsx`（鉴权、Prisma 查询、序列化）+ 同目录 `*-client.tsx`（交互）。
- 四个词库视图共享 `[wordbook]` slug：`practice`、`wrong-words`、`learning`、`mastered`；集合页通过 `src/components/collection-tabs.tsx` 互链。
- TS 单测与源码共置于 `src/**/*.test.{ts,tsx}`；Python parser 测试集中在 `tests/test_parser.py`，夹具在 `fixtures/`。
- `book_a`/`book_b` 是 PDF 管线内部名，不等于用户面 slug `concise`/`full`；CET-6 走独立 DOCX parser。
- ETL 顺序：`extract_full` → `parse_full` → `cross_validate` → `seed_export`；`raw/parsed/diff` 都是可重建中间产物。
- 开发 schema 是 SQLite；Docker 入口在 PostgreSQL 环境下临时改 provider，启动后恢复文件。没有常规 Prisma migrations，主要使用 `prisma db push`。
- 修改 `prisma/schema.prisma` 后**必须**跑 `npx prisma db push` 才能让本地 `prisma/dev.db` 跟上。`prisma generate` 只重生成 client 类型，不动数据库文件；docker entrypoint 在容器启动时自动 `db push`，但本地 dev server 不会。漏跑会让所有访问新字段的 API 抛 P2022（column does not exist）。

## ANTI-PATTERNS
- 不要裸跑无 `where` 的 `updateMany({})` / `deleteMany({})`，也不要直接执行全表 `psql DELETE`；测试清理必须限定具体 ID。正式重置必须走 `/api/admin/reset`。
- 重置确认短语必须完整匹配：`RESET PROGRESS`、`DELETE ATTEMPTS`、`DELETE SESSIONS`、`RESET EVERYTHING`。
- `Session.mode === "review"` 时只插入 Attempt，绝不修改 Word 的 attempts/level/correct/masteredAt。
- `UserSettings.enablePronunciation` 已标记 deprecated；新逻辑使用 `pronunciationMode`。
- 不要提交 `.env`、`public/audio/*.mp3` 或 `release/*.tgz`；音频用 bundle/`AUDIO_BUNDLE_URL` 分发。
- 部署时不要把 3000 端口直接暴露到公网（由 nginx 反代）；首次登录后删除 `.admin_password`。
- `docker compose down -v` 会删除 PostgreSQL volume；执行前必须明确接受数据清除。

## COMMANDS
```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:parser
npm run build
npm run db:push
npm run db:seed
npm run gate                 # 需要本地 PDF 源文件
npm run extract:full         # PDF -> raw/
npm run parse:full           # raw/ -> parsed/
npm run seed:export          # parsed/ -> seed/（会改 tracked JSON）
docker compose up -d --build
docker compose logs -f app
docker compose down            # 不带 -v 才保留 volume
```

## NOTES
- CI 跑 lint/typecheck/build/Vitest 与 pytest；accuracy gate 因源 PDF 被 gitignore，需本地手动运行 `npm run gate`。
- `tools/fetch_pronunciations.py`、`audit/spot-check.py` 和 release 上传会访问网络；未获明确要求不要运行。
- `seed/` 与 `fixtures/` 是维护型 tracked 数据；`raw/`、`parsed/`、`diff/`、`.next/`、`public/audio/`、`release/` 是生成物，不要在其中创建子级 AGENTS.md。
- 根 PDF/DOCX 是外部输入，不是应用源码；以代码/配置为准，README 与本地 handoff 可能滞后。
