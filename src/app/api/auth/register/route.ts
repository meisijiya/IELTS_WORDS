import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  createSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from "@/lib/auth";

export async function POST(request: Request) {
  let body: { code?: string; username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!code || !username || !password) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username) || username.length < 3 || username.length > 32) {
    return NextResponse.json({ error: "用户名需 3-32 字符，仅字母/数字/下划线" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 个字符" }, { status: 400 });
  }

  // (a) Username collision check FIRST — cheaper than the invite lookup.
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }

  // (b) Invitation-code validity check.
  const invitation = await prisma.invitation.findUnique({ where: { code } });
  const now = new Date();
  if (!invitation || invitation.usedAt || invitation.expiresAt < now) {
    return NextResponse.json({ error: "邀请码无效或已过期" }, { status: 400 });
  }

  // Atomically: create user, mark invitation used, create empty settings.
  // The invitation UNIQUE collision on code is unlikely but handled by Prisma;
  // a rolled-back txs leaves no partial rows visible to other readers.
  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { username, passwordHash, role: "user" },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date(), inviteeId: u.id },
      });
      await tx.userSettings.create({ data: { userId: u.id } });
      return u;
    });
  } catch (e: unknown) {
    // Race: another concurrent registrant claimed the invitation via the
    // same code. We do not retry — surface a clear error.
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "邀请码已被使用" }, { status: 400 });
    }
    throw e;
  }

  const cookieValue = await createSessionCookie(user.id, user.role);
  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
  });
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
