# src/app/api/ · Route handlers 域

13 个 Next.js route handler 集中在此。仅描述 API 层专属约束;共享原语(认证、Prisma、限流)见父级与 `src/lib/AGENTS.md`。

## 资源 vs 动作路由

- 资源型端点按 HTTP 动词挂资源上:`GET /api/words`、`POST /api/sessions`、`POST /api/attempts`、`PATCH /api/sessions/[id]`、`DELETE /api/sessions/[id]`、`PUT /api/users/me`、`PUT /api/admin/users/[id]`。
- 动作型端点用动词子路径,仅暴露 `POST`:
  - `/api/words/mark-mastered` — 手动标记 `level=5`
  - `/api/sessions/[id]/end` — 提前结束会话
  - `/api/admin/checkin/cleanup` — 删除 N 天前的 Checkin 快照(由用户在 Settings 触发,confirm phrase = `CLEAN N DAYS`)
  - `/api/admin/reset` — 确认短语全量重置
  - `/api/admin/invites` — POST 创建新邀请码,DELETE `[code]` 作废
  - `/api/checkin/reset` — 删除当前用户所有 Checkin 快照(confirm phrase = `CLEAN ALL CHECKINS`)
  - `/api/auth/register` — POST `{ username, password, code }` 注册新账号
  - `/api/auth/login` — POST `{ username, password }` 颁发 session cookie
- 新增路由时若命名属于"动词 + 资源",按动作型处理;否则按资源型。两种风格在同一项目共存,不要把动作型改造成 PATCH/PUT 形式。

## 鉴权调用顺序

- 每个 handler(除 `/api/auth/*` 外)首行必须 `await requireUser()`(返回 `{ id, role }`);失败抛 `ApiAuthError` → handler 捕获后返回 `authErrorResponse()` 即 `401`。
- Admin-only 路由额外调 `requireAdmin()`;失败抛 `ApiAuthError` → 401(并非 403,因为 edge middleware 拦截前的伪路径不该泄露)。
- `src/middleware.ts` 已对路径做前置拦截,但**不是替代**——客户端/服务端都必须做二次校验,避免内部调用绕过 Edge 网关。

## 错误模型

- 抛出 `ApiError`(在 `src/lib/auth.ts` 或同级定义)→ handler 捕获后 `Response.json({error, message}, {status})`。
- 资源未找到时统一返回 `404`,不要用 `500`:`SESSION_NOT_FOUND`、`WORD_NOT_FOUND`、`CHECKIN_NOT_FOUND`、`SETTINGS_NOT_FOUND`。
- `/api/admin/reset` 必须完整匹配 confirm phrase:`RESET PROGRESS` / `DELETE ATTEMPTS` / `DELETE SESSIONS` / `RESET EVERYTHING`。
- `/api/auth/register` 顺序校验:先 username 重复(`409 USERNAME_TAKEN`)→ 再 invitation code 无效/已用/过期(`400 INVITATION_INVALID`)。两段错误信息独立,不要合二为一。
- `/api/checkin/reset` 确认 phrase = `CLEAN ALL CHECKINS`,逐字匹配;任何拼写差异都返回 `400 CONFIRM_REQUIRED`。

## 限流作用域

- `src/lib/rate-limit.ts` 仅作用于 `/api/auth/login`(5 次失败 / 60 秒 → `429` + `Retry-After`)。
- 单进程 Map 实现,不适合多实例部署;扩容前需替换为 Redis。
- `/api/auth/register` 不限流(邀请码一次性 + 7 天过期已具备防滥用能力)。

## 排行榜

- `/api/leaderboard` — `GET` 返回全员 today attempts + mastered + 最近 5 个答对词。⚠️ **逻辑与 `src/lib/leaderboard.ts: getLeaderboard()` 80% 重复**。新代码应直接调 lib,不要复制粘贴。
- `/api/leaderboard/[userId]/today` — `GET` 返回该用户今日 attempt 明细(单词 + correct + 时刻);卡片点击展开使用。
- 两个 endpoint **仍** 用 `getCurrentUser()` 自实现 401,而非 `requireUser()`(返回 401 效果相同但风格不一致,API 路由约定要求 `requireUser()`)。修复优先级 P2。

## 新增 endpoint 模板

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }
  // ... body 解析 + where: { userId: user.id } 作用域 + try/catch 包 DB + crypto
}
```

Admin-only 加 `requireAdmin()`;密码修改/用户管理走 `src/lib/password.ts: hashPassword()`。

## 静态资源缓存

- `/home/ljh2923/opencode-project/English_YASI/next.config.ts` 给 `/audio/*` 设置 `Cache-Control: public, max-age=31536000, immutable` + `X-Content-Type-Options: nosniff`。
- 改音频文件名才能让浏览器侧失效,不要依赖 query string。

## 反模式

- 不要 `new PrismaClient()`;统一从 `@/lib/db` 导入单例。
- 不要把 `await isAuthenticated()` 放到 try/catch 外面或异步并发调用,顺序执行以保证错误传播。
- 不要在 API route handler 内 `Response.json(new PrismaClient...)`;序列化只能传可序列化字段。
- 不要把 `/api/admin/reset` 当普通更新接口;必须 confirm phrase 防呆(根 AGENTS.md ANTI-PATTERNS 已记录)。
- 不要在 route handler 内硬编码 `level >= 5` 当作「已熟练」判定。`/api/attempts` 的 SM-2、`/api/words` 的 PULL_CONFIG、`/api/analytics` 的计数都依赖 `settings.masteryThreshold` (默认 5,见 `prisma/AGENTS.md`)。`/api/settings` PUT 改阈值时已经做了 eager promotion,所以读点只需依赖 `masteredAt` 与 `level` 这两个 Word 字段,不需要重读 settings。