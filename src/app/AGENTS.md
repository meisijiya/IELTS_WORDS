# src/app/ · App Router 域

Next.js App Router 的页面、布局、客户端组件与 API route handlers 集中在这里。仅描述本目录专属边界;鉴权/数据库/共享组件见父级文档与 `src/lib/AGENTS.md`。

## 页面与客户端拆分

- 每个页面的标准结构是同目录 `page.tsx`(RSC,服务端鉴权 + Prisma 查询 + 序列化)+ `*-client.tsx`(浏览器端交互,顶部 `"use client"`)。
- 不要把 Prisma 对象或服务端函数直接传给客户端组件;只能传可序列化数据。
- 路由由文件系统决定,不要仅凭普通 import 图判定文件是否可删;API route handler 没有静态导入时也算有效入口。

## [wordbook] 四个视图

四个视图共用同一 slug 与数据库查找模式:

- `/practice/[wordbook]`
- `/wrong-words/[wordbook]`
- `/learning/[wordbook]`
- `/mastered/[wordbook]`

slug 映射用户面命名 `concise` / `full` / `cet6`。`book_a` / `book_b` 只属于 PDF 管线内部名,不得用于页面链接或客户端逻辑。四个视图通过 `/home/ljh2923/opencode-project/English_YASI/src/components/collection-tabs.tsx` 互链,加新词库视图必须同步更新该组件。

每个词库页面都沿用同一模板:读取 slug → 查找 `Wordbook` → 服务端查询当前用户数据 → 序列化 → 交给同目录 Client Component。

## 练习与会话

- `/practice/[wordbook]` 的练习状态机由同目录 `practice-client.tsx` 承担,负责队列、提交、提示、音频与 streak。
- `/api/sessions` 创建/复用会话,相同 word ID 集合(含乱序)按 `sameIds` 规则复用。
- `/api/sessions/[id]` 中的 `[id]` 是具体会话 UUID,不要把 slug / 日期 / 用户 ID 当作 `[id]`。

## Checkin 动态日期

- `/checkin/[date]` 中 `[date]` 是 `YYYY-MM-DD` 日期。
- 与会话 `[id]` 是两套不同的动态段语义,不要复用解析逻辑。
- 重置 attempts 不会清空打卡页;`/home/ljh2923/opencode-project/English_YASI/src/lib/checkin-snapshot.ts` 已做懒快照 + 重置前 eager 快照。

## 登录与 next 参数

- `/login` 可通过 `?next=/some/path` 携带登录后目标,登录成功后站内跳转到该路径。
- 未登录访问受保护路径时,`src/middleware.ts` 会自动补 `next`,不要让 Client Component 重复实现。
- 缺少 `next` 或目标无效时跳回默认页面。**不要把未经校验的外部 URL 直接作为 `next` 值**,避免开放重定向。

## 主题与样式

- `/home/ljh2923/opencode-project/English_YASI/src/app/globals.css` 是 Tailwind + 全局 CSS 变量入口,主题名为"冬天旭日"。
- 主强调色 `#E8845F`(对应 Tailwind token `bg-accent` / `text-accent`),深青 success `#0D9488`,警告 `#D97706`,错误 `#DC2626`。
- 新增页面优先复用现有 Tailwind 类和全局 CSS 变量;页面级 CSS 只保留该页面无法用 Tailwind 表达的规则。

## 反模式

- `/home/ljh2923/opencode-project/English_YASI/src/app/active-session-card.tsx` 当前放在 `src/app/` 根下,实际是跨页面复用组件,应迁到 `/home/ljh2923/opencode-project/English_YASI/src/components/active-session-card.tsx`。新增可复用 UI 不应放进 `src/app/`。
- `src/app/` 只保留路由入口、页面专属 Client Component、布局与 route handler;跨页面 UI 全部进 `src/components/`。