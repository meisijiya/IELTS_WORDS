# SRC KNOWLEDGE BASE · `/home/ljh2923/opencode-project/English_YASI/src/`

**焦点：** Next.js 应用 + 共享 lib/与 components/ + Python parser 的 tree 内部规则。仓库级常识见根 `/home/ljh2923/opencode-project/English_YASI/AGENTS.md`。

## OVERVIEW
`src/` 是运行时源代码唯一来源。TS/TSX 走 Next.js App Router；`src/parser.py` 是 PDF 行分类的纯 Python 入口，由 `tests/` 与 `tools/parse_full.py` 通过 `sys.path.insert(0, …/src)` 动态导入，不参与 build。Python 与 TypeScript 在同一目录并存，互不引用。

## WHERE TO LOOK
| 任务 | 路径 | 关键事实 |
|---|---|---|
| Edge 鉴权 gate | `/home/ljh2923/opencode-project/English_YASI/src/middleware.ts` | Web Crypto HMAC；matcher 排除 `_next/static`、`_next/image`、`favicon.ico`；allowlist：`/login`、`/api/auth`、`/audio/`、`/favicon.ico` |
| 鉴权原语 | `/home/ljh2923/opencode-project/English_YASI/src/lib/auth.ts` | `SESSION_COOKIE_NAME="yasi_session"`；`verifySessionCookie` / `checkPassword` / `isAuthenticated`；server-only，client bundle 零依赖；payload 含 `userId` + `role` |
| Route 鉴权守卫 | `/home/ljh2923/opencode-project/English_YASI/src/lib/api.ts` | `requireUser()` / `requireAdmin()` / `authErrorResponse()`；所有 `/api/*`（除 auth/*）首行调用 |
| 密码哈希 | `/home/ljh2923/opencode-project/English_YASI/src/lib/password.ts` | PBKDF2-SHA-256 100k iters；`hashPassword` / `verifyPassword` / `validateUsername` / `validatePassword` |
| Prisma 单例 | `/home/ljh2923/opencode-project/English_YASI/src/lib/db.ts` | 全局缓存，development 仅打 error/warn；业务文件从 `@/lib/db` 导入 |
| 词集合三路分区 | `/home/ljh2923/opencode-project/English_YASI/src/lib/word-collections.ts` | wrong / learning / mastered 互斥 |
| 30 天聚合 | `/home/ljh2923/opencode-project/English_YASI/src/lib/word-history.ts` | `DailyStat` 类型由 sparkline 复用 |
| Checkin 快照（三桶） | `/home/ljh2923/opencode-project/English_YASI/src/lib/checkin-snapshot.ts` | reset 前 eager 写盘；masteredTodayCount = promote events in [date, date+1)；详见 `src/lib/AGENTS.md` |
| 排行榜 | `/home/ljh2923/opencode-project/English_YASI/src/lib/leaderboard.ts` | ⚠️ 80% 代码与 `/api/leaderboard/route.ts` 重复，新增路由直接调此 lib |
| 限流 | `/home/ljh2923/opencode-project/English_YASI/src/lib/rate-limit.ts` | 内存计数器 |
| Collection tabs | `/home/ljh2923/opencode-project/English_YASI/src/components/collection-tabs.tsx` | 三个 slug 互链，保留 `?range=` |
| 错词曲线 | `/home/ljh2923/opencode-project/English_YASI/src/components/wrong-word-sparkline.tsx` | 120×32 inline SVG；`findNearestIndex` 暴露给单测 |
| PDF 解析 | `/home/ljh2923/opencode-project/English_YASI/src/parser.py` | `parse_page_lines` / `parse_page_dict` / `lines_from_fixture`；WORD_X0_MAX=100、GLOSS_X0_MIN=130、CROSS_LINE_GAP_PT=50 |
| 练习主循环 | `/home/ljh2923/opencode-project/English_YASI/src/app/practice/[wordbook]/practice-client.tsx` | 1053 行；wordHistory 栈 cap 20 + HistoryModal + soundEnabled ref 守卫 |
| 错词榜展开 | `/home/ljh2923/opencode-project/English_YASI/src/app/wrong-words/[wordbook]/wrong-words-client.tsx` | 接入 `WrongWordSparkline` |
| Admin 邀请码 | `/home/ljh2923/opencode-project/English_YASI/src/app/admin/invites/` | 详见 `src/app/admin/AGENTS.md` |
| 排行榜页 | `/home/ljh2923/opencode-project/English_YASI/src/app/leaderboard/` | RSC 初始 + client 30s 轮询 + 卡片点击展开今日明细 |
| 邀请注册 | `/home/ljh2923/opencode-project/English_YASI/src/app/register/` | 一次性 code + username + password + confirm；调 `/api/auth/register` |
| API 路由 | `/home/ljh2923/opencode-project/English_YASI/src/app/api/{sessions,attempts,words,analytics,settings,auth,admin,users,leaderboard,checkin}/...` | 19 个 endpoint；除 `auth/*` 全部走 `requireUser()`，详见 `src/app/api/AGENTS.md` |
| Ops 脚本 | `/home/ljh2923/opencode-project/English_YASI/scripts/` | server-bootstrap + fix-prod-schema + migrate-legacy-userdata；详见 `scripts/AGENTS.md` |
| Ops workflows | `/home/ljh2923/opencode-project/English_YASI/.github/workflows/` | 8 个 `workflow_dispatch` 恢复/诊断/备份 workflow；详见 `.github/workflows/AGENTS.md` |

## CONVENTIONS
- 路径别名：`@/*` → `src/*`；导入仅走 `@/lib/*`、`@/components/*`。
- 页面配对：同目录 `page.tsx`（Server Component，做鉴权/查询）+ `*-client.tsx`（Client Component，做交互）。`src/app/active-session-card.tsx` 与 `checkin-client.tsx` 是同模式特例。
- 四个 `[wordbook]` 视图共享 slug 段：`practice` / `wrong-words` / `learning` / `mastered`；slug 名仅这三个，不复用 PDF 内部名 `book_a`/`book_b`。
- 单测共置：每个源文件旁放同目录 `*.test.{ts,tsx}`（`/home/ljh2923/opencode-project/English_YASI/src/lib/word-collections.test.ts`、`/home/ljh2923/opencode-project/English_YASI/src/app/practice/[wordbook]/practice-client.test.ts` 等）。
- Python 接入：测试与脚本把 `src/` 加入 `sys.path`，调用 `from parser import …`；parser 不依赖任何 TS、不生成 artefact（fixture 进 `fixtures/`）。
- Client Component 顶部必须 `"use client"`；仅访问 `process.env.NEXT_PUBLIC_*` 的字段。
- 浏览器存储：cookie 走 `yasi_session`，TTL 30 天；本地存储不另立实现。

## ANTI-PATTERNS
- 业务文件禁止 `new PrismaClient()`；统一 `import { prisma } from "@/lib/db"`。
- 不要把 `src/parser.py` 当 ESM 或 TS 模块 import；调用方走 `subprocess` 或 `sys.path.insert`。
- Middleware 仅承担 redirect；业务逻辑（如越权数据过滤）仍要在 page 或 route handler 内校验，不要相信 middleware 已经查 DB。
- 不要在客户端组件中读 `process.env.SESSION_SECRET` / `ADMIN_PASSWORD`；`src/lib/auth.ts` 引用这些 env 的函数仅在 server runtime 可用。
- 不要在 `src/components/` 放业务逻辑：纯展示与布局；数据形状与查询留在 `src/lib/` 或 `src/app/`。
- 不要创建 `/home/ljh2923/opencode-project/English_YASI/src/_*`、`.next/`、`.turbo/` 等目录；前者会污染 `@` 别名，后者是 build 中间产物。
