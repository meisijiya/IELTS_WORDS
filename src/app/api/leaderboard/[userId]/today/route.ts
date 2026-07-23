import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { userId: rawId } = await params;
  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const attempts = await prisma.attempt.findMany({
    where: { userId, createdAt: { gte: startOfDay } },
    orderBy: { createdAt: "desc" },
    include: {
      word: { select: { spelling: true, pos: true, glosses: true } },
    },
  });

  const totalToday = attempts.length;
  const correctToday = attempts.filter((a) => a.correct).length;

  return NextResponse.json({
    user: target,
    date: startOfDay.toISOString(),
    totalToday,
    correctToday,
    attempts: attempts.map((a) => ({
      id: a.id,
      spelling: a.word.spelling,
      pos: a.word.pos,
      glosses: JSON.parse(a.word.glosses),
      typed: a.typed,
      correct: a.correct,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
