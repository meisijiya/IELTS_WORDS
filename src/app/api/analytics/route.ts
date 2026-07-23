import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, authErrorResponse, ApiAuthError } from "@/lib/api";

const MASTERY_THRESHOLD_FALLBACK = 5;

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

const ALL_RANGES = ["today", "week", "month"] as const;
type WindowRange = (typeof ALL_RANGES)[number] | "all";

interface RangeStats {
  totalAttempted: number;
  newCount: number;
  learningCount: number;
  masteredCount: number;
}

async function distinctAttemptWordIds(
  userId: number,
  wordbookId: number,
  since: Date | null,
): Promise<number[]> {
  // Prisma 6 doesn't support `distinct` on `select`, so we fetch the
  // distinct pairs in code. Cap at 5000 distinct words per window — enough
  // for any realistic wordbook (the largest is 7k+ but no user practices
  // even close to that in a single window).
  const rows = await prisma.attempt.findMany({
    where: {
      userId,
      session: { wordbookId },
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: { wordId: true },
  });
  return [...new Set(rows.map((r) => r.wordId))];
}

function classifyAttemptedWords(
  distinctWordIds: number[],
  userWordMap: Map<number, { attempts: number; level: number; masteredAt: Date | null; firstAttemptedAt: Date | null }>,
  rangeStart: Date | null,
  rangeEnd: Date | null,
  masteryThreshold: number,
): RangeStats {
  let newCount = 0;
  let masteredCount = 0;
  let learningCount = 0;
  for (const wordId of distinctWordIds) {
    const uw = userWordMap.get(wordId);
    if (!uw) {
      newCount += 1;
      continue;
    }
    if (
      rangeEnd &&
      uw.masteredAt !== null &&
      uw.masteredAt >= rangeStart! &&
      uw.masteredAt < rangeEnd
    ) {
      masteredCount += 1;
    } else if (rangeStart && uw.firstAttemptedAt && uw.firstAttemptedAt >= rangeStart && uw.masteredAt === null) {
      newCount += 1;
    } else if (uw.masteredAt === null) {
      learningCount += 1;
    }
  }
  return {
    totalAttempted: distinctWordIds.length,
    newCount,
    learningCount,
    masteredCount,
  };
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof ApiAuthError) return authErrorResponse();
    throw e;
  }

  const url = new URL(request.url);
  const wordbookId = Number(url.searchParams.get("wordbookId"));
  const range = url.searchParams.get("range") ?? "all";
  const since = rangeToSince(range);

  if (!Number.isInteger(wordbookId)) {
    return NextResponse.json({ error: "wordbookId required" }, { status: 400 });
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { masteryThreshold: true },
  });
  const masteryThreshold = settings?.masteryThreshold ?? MASTERY_THRESHOLD_FALLBACK;

  // Window ranges in parallel: 今日/近一周/近一月. "all" falls back to no `since`
  // — we reuse the `all`-equivalent "no since" branch lazily below.
  const rangeSincePairs: Array<[WindowRange, Date | null]> = [
    ["today", rangeToSince("today")],
    ["week", rangeToSince("week")],
    ["month", rangeToSince("month")],
    ["all", null],
  ];
  const attemptedIdsByRange: Record<WindowRange, number[]> = {
    today: [],
    week: [],
    month: [],
    all: [],
  };
  await Promise.all(
    rangeSincePairs.map(async ([key, since]) => {
      attemptedIdsByRange[key] = await distinctAttemptWordIds(user.id, wordbookId, since);
    }),
  );

  // Need userWord state for every distinct wordId touched across any window.
  const allTouched = new Set<number>();
  for (const arr of Object.values(attemptedIdsByRange)) {
    for (const id of arr) allTouched.add(id);
  }
  const userWordRows = allTouched.size
    ? await prisma.userWord.findMany({
        where: { userId: user.id, wordId: { in: [...allTouched] } },
        select: { wordId: true, attempts: true, masteredAt: true, level: true, firstAttemptedAt: true },
      })
    : [];
  const userWordMap = new Map(
    userWordRows.map((uw) => [
      uw.wordId,
      {
        attempts: uw.attempts,
        level: uw.level,
        masteredAt: uw.masteredAt,
        firstAttemptedAt: uw.firstAttemptedAt,
      },
    ]),
  );

  const now = new Date();
  const byRange: Record<WindowRange, RangeStats> = {
    today: classifyAttemptedWords(attemptedIdsByRange.today, userWordMap, rangeToSince("today"), now, masteryThreshold),
    week: classifyAttemptedWords(attemptedIdsByRange.week, userWordMap, rangeToSince("week"), now, masteryThreshold),
    month: classifyAttemptedWords(attemptedIdsByRange.month, userWordMap, rangeToSince("month"), now, masteryThreshold),
    all: classifyAttemptedWords(attemptedIdsByRange.all, userWordMap, null, null, masteryThreshold),
  };

  // All-time cumulative buckets (NOT scoped to a range). `newWordsEver` = words
  // with no UserWord row at all (the relation filter handles the cross-table
  // "never attempted" case correctly).
  const [totalWords, learningWordsEver, masteredWordsEver, allAttempts, recentSessions] = await Promise.all([
    prisma.word.count({ where: { wordbookId } }),
    prisma.userWord.count({
      where: {
        userId: user.id,
        word: { wordbookId },
        attempts: { gt: 0 },
        masteredAt: null,
      },
    }),
    prisma.userWord.count({
      where: {
        userId: user.id,
        word: { wordbookId },
        OR: [
          { masteredAt: { not: null } },
          { level: { gte: masteryThreshold } },
        ],
      },
    }),
    prisma.attempt.findMany({
      where: {
        userId: user.id,
        session: { wordbookId },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: { word: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.session.findMany({
      where: {
        userId: user.id,
        wordbookId,
        ...(since ? { startedAt: { gte: since } } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { id: true, startedAt: true, endedAt: true, totalWords: true, correctCount: true },
    }),
  ]);

  // newWordsEver derived as totalWords minus (learning + mastered) so it
  // matches the 4-category breakdown the user expects (new + learning +
  // mastered = total).
  const newWordsEver = Math.max(0, totalWords - learningWordsEver - masteredWordsEver);

  const incompleteSessions = recentSessions.filter(
    (s) => s.endedAt === null || s.totalWords === 0
  );
  const liveSessionIds = incompleteSessions.map((s) => s.id);
  const liveCounts = liveSessionIds.length
    ? await prisma.attempt.groupBy({
        by: ["sessionId", "correct"],
        where: { userId: user.id, sessionId: { in: liveSessionIds } },
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

  const wordIds = [...new Set(allAttempts.map((a) => a.wordId))];
  const userWordRows2 = wordIds.length
    ? await prisma.userWord.findMany({
        where: { userId: user.id, wordId: { in: wordIds } },
        select: { wordId: true, level: true },
      })
    : [];
  const levelByWord = new Map(userWordRows2.map((uw) => [uw.wordId, uw.level]));

  const mistakeMap = new Map<number, Mistake & { level: number }>();
  for (const a of allAttempts) {
    const cur = mistakeMap.get(a.wordId) ?? {
      wordId: a.wordId,
      spelling: a.word.spelling,
      pos: a.word.pos,
      glosses: JSON.parse(a.word.glosses),
      level: levelByWord.get(a.wordId) ?? 0,
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
      newWords: newWordsEver,
      learningWords: learningWordsEver,
      masteredWords: masteredWordsEver,
      progressPct: totalWords > 0 ? Math.round((masteredWordsEver / totalWords) * 100) : 0,
    },
    byRange: {
      today: {
        totalAttempted: byRange.today.totalAttempted,
        newWords: byRange.today.newCount,
        learningWords: byRange.today.learningCount,
        masteredWords: byRange.today.masteredCount,
      },
      week: {
        totalAttempted: byRange.week.totalAttempted,
        newWords: byRange.week.newCount,
        learningWords: byRange.week.learningCount,
        masteredWords: byRange.week.masteredCount,
      },
      month: {
        totalAttempted: byRange.month.totalAttempted,
        newWords: byRange.month.newCount,
        learningWords: byRange.month.learningCount,
        masteredWords: byRange.month.masteredCount,
      },
      all: {
        totalAttempted: byRange.all.totalAttempted,
        newWords: byRange.all.newCount,
        learningWords: byRange.all.learningCount,
        masteredWords: byRange.all.masteredCount,
      },
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
