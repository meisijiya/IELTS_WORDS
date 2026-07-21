import { NextResponse } from "next/server";
import { checkPassword, createSessionCookie, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "@/lib/auth";
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

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const password = body.password;
  if (typeof password !== "string" || !checkPassword(password)) {
    recordFail(ip);
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  resetBucket(ip);
  const cookieValue = await createSessionCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}