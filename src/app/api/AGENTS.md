# src/app/api/ · Route handlers 域

13 个 Next.js route handler 集中在此。仅描述 API 层专属约束;共享原语(认证、Prisma、限流)见父级与 `src/lib/AGENTS.md`。

## 资源 vs 动作路由

- 资源型端点按 HTTP 动词挂资源上:`GET /api/words`、`POST /api/sessions`、`POST /api/attempts`、`PATCH /api/sessions/[id]`、`DELETE /api/sessions/[id]`。
- 动作型端点用动词子路径,仅暴露 `POST`:
  - `/api/words/mark-mastered` — 手动标记 `level=5`
  - `/api/sessions/[id]/end` — 提前结束会话
  - `/api/admin/checkin/cleanup` — 删除 N 天前的 Checkin 快照(由用户在 Settings 触发,confirm phrase = `CLEAN N DAYS`)
- 新增路由时若命名属于"动词 + 资源",按动作型处理;否则按资源型。两种风格在同一项目共存,不要把动作型改造成 PATCH/PUT 形式。

## 鉴权调用顺序

- 每个 handler(除 `/api/auth/*` 外)首行必须 `await isAuthenticated()`;失败立即 `401`。
- `src/middleware.ts` 已对路径做前置拦截,但**不是替代**——客户端/服务端都必须做二次校验,避免内部调用绕过 Edge 网关。

## 错误模型

- 抛出 `ApiError`(在 `src/lib/auth.ts` 或同级定义)→ handler 捕获后 `Response.json({error, message}, {status})`。
- 资源未找到时统一返回 `404`,不要用 `500`:`SESSION_NOT_FOUND`、`WORD_NOT_FOUND`、`CHECKIN_NOT_FOUND`、`SETTINGS_NOT_FOUND`。
- `/api/admin/reset` 必须完整匹配 confirm phrase:`RESET PROGRESS` / `DELETE ATTEMPTS` / `DELETE SESSIONS` / `RESET EVERYTHING`。

## 限流作用域

- `src/lib/rate-limit.ts` 仅作用于 `/api/auth/login`(5 次失败 / 60 秒 → `429` + `Retry-After`)。
- 单进程 Map 实现,不适合多实例部署;扩容前需替换为 Redis。

## 静态资源缓存

- `/home/ljh2923/opencode-project/English_YASI/next.config.ts` 给 `/audio/*` 设置 `Cache-Control: public, max-age=31536000, immutable` + `X-Content-Type-Options: nosniff`。
- 改音频文件名才能让浏览器侧失效,不要依赖 query string。

## 反模式

- 不要 `new PrismaClient()`;统一从 `@/lib/db` 导入单例。
- 不要把 `await isAuthenticated()` 放到 try/catch 外面或异步并发调用,顺序执行以保证错误传播。
- 不要在 API route handler 内 `Response.json(new PrismaClient...)`;序列化只能传可序列化字段。
- 不要把 `/api/admin/reset` 当普通更新接口;必须 confirm phrase 防呆(根 AGENTS.md ANTI-PATTERNS 已记录)。