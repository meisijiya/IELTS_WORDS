# `src/app/admin/` · Admin UI

admin 角色独占页面。普通用户访问会被 redirect。

## Pages

- **`invites/page.tsx`** — admin 邀请码管理 RSC。`getCurrentUser()` + `requireAdmin()` 检查；查所有 `Invitation` + `User` 列表。`/admin/users/[id]/route.ts` 在此页被调用（编辑用户名 modal）。
- **`invites/invites-client.tsx`** — 邀请码 CRUD（POST 创建 / DELETE 撤销 / 复制 code 到剪贴板）+ 用户列表（含 ADMIN 徽章）+ 编辑用户名 inline modal。

## API surface (admin-only)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/invites` | 创建邀请码（可选 `ttlDays`，默认 7） |
| GET | `/api/admin/invites` | 列出所有未过期 + 已使用邀请码 |
| DELETE | `/api/admin/invites/[code]` | 作废邀请码 |
| PUT | `/api/admin/users/[id]` | admin 改任意用户名（不需要当前密码） |
| POST | `/api/admin/reset` | 全量重置（confirm phrase 防呆） |
| POST | `/api/admin/checkin/cleanup` | 删除 N 天前的 Checkin 快照 |

## Conventions

- RSC 层做双重守卫：`getCurrentUser()` 检查登录 + `user.role !== "admin" → redirect("/")`。
- 跨用户操作（admin reset / cleanup）保留 `userId: user.id` 作用域 — 只清 admin 自己的数据，**不是** 全员数据。
- 邀请码生成：12 字符 url-safe base64（9 随机字节），POST 创建有 5 次碰撞重试。

## Non-standard

- URL 是 `/admin/invites`，**没有**独立 `/admin/page.tsx`。所有 admin 功能集中在 invites 页面。
- admin 可访问 `/admin/invites` 页面同时调用 `/api/admin/users/[id]/route.ts` 改任意用户名——前端没有专门的用户管理页，编辑在邀请码页 inline 完成。