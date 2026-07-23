import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { checkRate, recordFail, resetBucket, getIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = getIp(request);
  const rate = checkRate(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后重试" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "用户名和密码均不能为空" }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { username } });
  } catch (e) {
    console.error(`[auth/login] DB lookup failed for '${username}':`, e);
    return NextResponse.json({ error: "服务暂时不可用" }, { status: 500 });
  }
  if (!user) {
    recordFail(ip);
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  if (!user.passwordHash) {
    console.error(`[auth/login] user '${username}' (id=${user.id}) has null passwordHash — schema out of sync`);
    return NextResponse.json({ error: "账号数据异常，请联系管理员" }, { status: 500 });
  }
  const passwordOk = await verifyPassword(password, user.passwordHash).catch((e) => {
    console.error(`[auth/login] verifyPassword threw for '${username}':`, e);
    return false;
  });
  if (!passwordOk) {
    recordFail(ip);
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  let cookieValue: string;
  try {
    cookieValue = await createSessionCookie(user.id, user.role);
  } catch (e) {
    console.error(`[auth/login] createSessionCookie failed for '${username}' (role='${user.role}'):`, e);
    return NextResponse.json({ error: "会话创建失败" }, { status: 500 });
  }

  resetBucket(ip);
  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username, role: user.role },
  });
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    // Secure cookies need HTTPS. Default off so plain-HTTP deploys work;
    // set AUTH_COOKIE_SECURE=true when behind a TLS terminator.
    secure: process.env.AUTH_COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
