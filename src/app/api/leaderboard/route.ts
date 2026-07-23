import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, role: true, createdAt: true },
  });

  const userIds = users.map((u) => u.id);

  const [todayAttempts, masteredCounts, recentCorrect] = await Promise.all([
    userIds.length
      ? prisma.attempt.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, createdAt: { gte: startOfDay } },
          _count: { _all: true },
        })
      : [],
    userIds.length
      ? prisma.userWord.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, masteredAt: { not: null } },
          _count: { _all: true },
        })
      : [],
    userIds.length
      ? prisma.attempt.findMany({
          where: { userId: { in: userIds }, correct: true },
          orderBy: { createdAt: "desc" },
          take: 200,
          include: { word: { select: { spelling: true } } },
        })
      : [],
  ]);

  const todayByUser = new Map(todayAttempts.map((r) => [r.userId, r._count._all]));
  const masteredByUser = new Map(masteredCounts.map((r) => [r.userId, r._count._all]));
  const recentByUser = new Map<number, Array<{ spelling: string; createdAt: string }>>();
  for (const a of recentCorrect) {
    const list = recentByUser.get(a.userId) ?? [];
    if (list.length < 5) {
      list.push({ spelling: a.word.spelling, createdAt: a.createdAt.toISOString() });
      recentByUser.set(a.userId, list);
    }
  }

  return NextResponse.json({
    today: startOfDay.toISOString(),
    entries: users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      isMe: u.id === me.id,
      todayAttempts: todayByUser.get(u.id) ?? 0,
      masteredCount: masteredByUser.get(u.id) ?? 0,
      recentWords: recentByUser.get(u.id) ?? [],
    })),
  });
}
