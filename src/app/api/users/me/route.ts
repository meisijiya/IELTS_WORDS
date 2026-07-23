import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

export async function PUT(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[a-zA-Z0-9_]+$/.test(username) || username.length < 3 || username.length > 32) {
    return NextResponse.json({ error: "用户名需 3-32 字符，仅字母/数字/下划线" }, { status: 400 });
  }
  if (password.length < 1) {
    return NextResponse.json({ error: "需要当前密码以确认修改" }, { status: 400 });
  }

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!current || !(await verifyPassword(password, current.passwordHash))) {
    return NextResponse.json({ error: "当前密码错误" }, { status: 401 });
  }

  if (username === user.username) {
    return NextResponse.json({
      id: user.id,
      username: user.username,
      role: user.role,
      unchanged: true,
    });
  }

  const collision = await prisma.user.findUnique({ where: { username } });
  if (collision && collision.id !== user.id) {
    return NextResponse.json({ error: "该用户名已被占用" }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { username },
    select: { id: true, username: true, role: true },
  });

  // Refresh the session cookie so the payload reflects the new username +
  // re-extends exp. Cookies are bound to the userId (not username) so this
  // is mostly cosmetic; re-issuing keeps the cookie lifetime fresh.
  const cookieValue = await createSessionCookie(updated.id, updated.role);
  const res = NextResponse.json({ id: updated.id, username: updated.username, role: updated.role });
  res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
