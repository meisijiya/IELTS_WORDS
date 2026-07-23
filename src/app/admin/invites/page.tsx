import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { InvitesClient } from "./invites-client";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const [invitations, users] = await Promise.all([
    prisma.invitation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        inviter: { select: { id: true, username: true } },
        invitee: { select: { id: true, username: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, role: true, createdAt: true },
    }),
  ]);

  return (
    <main className="min-h-screen px-4 py-10 md:px-8 max-w-3xl mx-auto">
      <header className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">管理</h1>
            <p className="text-sm text-muted-foreground">
              邀请码 · 用户列表。仅 admin 可见。
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-accent inline-flex items-center gap-1"
          >
            ← 主页
          </Link>
        </div>
        <div className="bg-accent-soft/40 border border-accent/20 rounded-lg p-3 text-sm text-foreground">
          <p>
            <span className="font-medium">改用户名：</span>
            下方「已注册用户」列表右侧的「编辑」按钮可修改任意用户（含你自己）的登录用户名。
          </p>
        </div>
      </header>
      <InvitesClient
        invitations={invitations.map((i) => ({
          id: i.id,
          code: i.code,
          inviter: i.inviter,
          invitee: i.invitee,
          expiresAt: i.expiresAt.toISOString(),
          usedAt: i.usedAt?.toISOString() ?? null,
          createdAt: i.createdAt.toISOString(),
        }))}
        users={users.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}
