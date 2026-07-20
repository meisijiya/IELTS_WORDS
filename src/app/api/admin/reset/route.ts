import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  let body: { scope?: "all" | "progress" };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const scope = body.scope ?? "progress";

  if (scope === "all") {
    await prisma.attempt.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.word.updateMany({ data: { level: 0, interval: 0, dueAt: null, attempts: 0, correct: 0 } });
    return NextResponse.json({ ok: true, scope: "all" });
  }

  await prisma.attempt.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.word.updateMany({ data: { level: 0, interval: 0, dueAt: null, attempts: 0, correct: 0 } });
  return NextResponse.json({ ok: true, scope: "progress" });
}