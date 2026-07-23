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

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFail(ip);
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  resetBucket(ip);
  const cookieValue = await createSessionCookie(user.id, user.role);
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
