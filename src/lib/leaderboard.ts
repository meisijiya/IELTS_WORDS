// Server-side leaderboard aggregation. Kept here so the API route and the
// page can share the same query shape; the /api/leaderboard route stays a
// thin HTTP wrapper for refresh-on-interval clients.

import { prisma } from "@/lib/db";

export interface LeaderboardEntry {
  id: number;
  username: string;
  role: string;
  isMe: boolean;
  todayAttempts: number;
  masteredCount: number;
  recentWords: Array<{ spelling: string; createdAt: string }>;
}

export interface Leaderboard {
  today: string;
  entries: LeaderboardEntry[];
}

export async function getLeaderboard(currentUserId: number): Promise<Leaderboard> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, role: true },
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

  return {
    today: startOfDay.toISOString(),
    entries: users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      isMe: u.id === currentUserId,
      todayAttempts: todayByUser.get(u.id) ?? 0,
      masteredCount: masteredByUser.get(u.id) ?? 0,
      recentWords: recentByUser.get(u.id) ?? [],
    })),
  };
}
