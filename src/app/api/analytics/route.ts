import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

const MASTERY_THRESHOLD_FALLBACK = 5;
const SETTINGS_SINGLETON_ID = 1;

interface Mistake {
  wordId: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  mistakes: number;
  correct: number;
}

function rangeToSince(range: string): Date | null {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  return null;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const url = new URL(request.url);
  const wordbookId = Number(url.searchParams.get("wordbookId"));
  const range = url.searchParams.get("range") ?? "all";
  const since = rangeToSince(range);

  if (!Number.isInteger(wordbookId)) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  const settings = await prisma.userSettings.findUnique({
    where: { id: SETTINGS_SINGLETON_ID },
    select: { masteryThreshold: true },
  });
  const masteryThreshold = settings?.masteryThreshold ?? MASTERY_THRESHOLD_FALLBACK;

  const [totalWords, newWords, learningWords, masteredWords, allAttempts, recentSessions] = await Promise.all([
    prisma.word.count({ where: { wordbookId } }),
    prisma.word.count({ where: { wordbookId, attempts: 0 } }),
    prisma.word.count({
      where: {
        wordbookId,
        attempts: { gt: 0 },
        level: { lt: masteryThreshold },
        masteredAt: null,
      },
    }),
    prisma.word.count({
      where: {
        wordbookId,
        OR: [
          { masteredAt: { not: null } },
          { level: { gte: masteryThreshold } },
        ],
      },
    }),
    prisma.attempt.findMany({
      where: {
        session: { wordbookId },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: { word: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.session.findMany({
      where: {
        wordbookId,
        ...(since ? { startedAt: { gte: since } } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { id: true, startedAt: true, endedAt: true, totalWords: true, correctCount: true },
    }),
  ]);

  const incompleteSessions = recentSessions.filter(
    (s) => s.endedAt === null || s.totalWords === 0
  );
  const liveSessionIds = incompleteSessions.map((s) => s.id);
  const liveCounts = liveSessionIds.length
    ? await prisma.attempt.groupBy({
        by: ["sessionId", "correct"],
        where: { sessionId: { in: liveSessionIds } },
        _count: { _all: true },
      })
    : [];
  const liveBySession = new Map<string, { total: number; correct: number }>();
  for (const row of liveCounts) {
    const cur = liveBySession.get(row.sessionId) ?? { total: 0, correct: 0 };
    cur.total += row._count._all;
    if (row.correct) cur.correct += row._count._all;
    liveBySession.set(row.sessionId, cur);
  }

  const correctCount = allAttempts.filter((a) => a.correct).length;
  const accuracy = allAttempts.length > 0 ? correctCount / allAttempts.length : 0;

  const mistakeMap = new Map<number, Mistake & { level: number }>();
  for (const a of allAttempts) {
    const cur = mistakeMap.get(a.wordId) ?? {
      wordId: a.wordId,
      spelling: a.word.spelling,
      pos: a.word.pos,
      glosses: JSON.parse(a.word.glosses),
      level: a.word.level,
      mistakes: 0,
      correct: 0,
    };
    if (a.correct) cur.correct++;
    else cur.mistakes++;
    mistakeMap.set(a.wordId, cur);
  }

  const topMissed = [...mistakeMap.values()]
    .filter((x) => x.mistakes > 0 && x.level < masteryThreshold)
    .sort((a, b) => b.mistakes - a.mistakes || a.correct - b.correct)
    .slice(0, 50)
    .map(({ level: _level, ...rest }) => rest);

  const errorPositions = { firstLetter: 0, lastLetter: 0, middle: 0, lengthMismatch: 0 };
  for (const a of allAttempts) {
    if (a.correct) continue;
    const expected = a.word.spelling;
    const typed = a.typed;
    if (typed.length !== expected.length) {
      errorPositions.lengthMismatch++;
      continue;
    }
    if (typed[0]?.toLowerCase() !== expected[0]?.toLowerCase()) errorPositions.firstLetter++;
    else if (typed[typed.length - 1]?.toLowerCase() !== expected[expected.length - 1]?.toLowerCase())
      errorPositions.lastLetter++;
    else errorPositions.middle++;
  }

  const sessions = recentSessions.map((s) => {
    const live = s.endedAt === null || s.totalWords === 0
      ? liveBySession.get(s.id)
      : null;
    return {
      id: s.id,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      totalWords: live ? live.total : s.totalWords,
      correctCount: live ? live.correct : s.correctCount,
    };
  });

  return NextResponse.json({
    progress: {
      totalWords,
      newWords,
      learningWords,
      masteredWords,
      progressPct: totalWords > 0 ? Math.round((masteredWords / totalWords) * 100) : 0,
    },
    recent: {
      totalAttempts: allAttempts.length,
      correctCount,
      accuracy: Math.round(accuracy * 1000) / 1000,
    },
    topMissed,
    errorPositions,
    sessions,
    range,
  });
}