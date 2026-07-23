import { prisma } from "@/lib/db";

const MASTERY_THRESHOLD_FALLBACK = 5;

export interface CheckinData {
  date: string;
  totalAttempts: number;
  correctCount: number;
  accuracy: number;
  masteredTodayCount: number;
  learningCount: number;
  wordsAttempted: number;
  sessionsCount: number;
  cumulativeMastered: number;
  topMissed: unknown[];
  wordbookBreakdown: Record<string, { name: string; attempts: number; correct: number; words: number }>;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

// ponytail: every checkin function takes userId — the per-user isolation
// layer above this lib (Wordbook is shared, Attempt/Checkin are per-user).

export async function computeCheckinData(userId: number, date: Date): Promise<CheckinData> {
  const start = startOfDay(date);
  const end = endOfDay(date);

  const todayWordIds = [...new Set(
    (await prisma.attempt.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      select: { wordId: true },
    })).map((a) => a.wordId),
  )];

  const [attempts, userWordRows, cumulativeMastered] = await Promise.all([
    prisma.attempt.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      include: { word: true, session: true },
      orderBy: { createdAt: "asc" },
    }),
    todayWordIds.length
      ? prisma.userWord.findMany({
          where: { userId, wordId: { in: todayWordIds } },
          select: { wordId: true, attempts: true, masteredAt: true, level: true, firstAttemptedAt: true },
        })
      : Promise.resolve([] as Array<{
          wordId: number;
          attempts: number;
          masteredAt: Date | null;
          level: number;
          firstAttemptedAt: Date | null;
        }>),
    prisma.userWord.count({ where: { userId, masteredAt: { not: null } } }),
  ]);

  const totalAttempts = attempts.length;
  const correctCount = attempts.filter((a) => a.correct).length;
  const accuracy = totalAttempts > 0 ? correctCount / totalAttempts : 0;
  const sessionsCount = new Set(attempts.map((a) => a.sessionId)).size;

  const wordStats = new Map<
    number,
    { spelling: string; pos: string | null; glosses: string; attempts: number; correct: number }
  >();
  for (const a of attempts) {
    const cur = wordStats.get(a.wordId) ?? {
      spelling: a.word.spelling,
      pos: a.word.pos,
      glosses: a.word.glosses,
      attempts: 0,
      correct: 0,
    };
    cur.attempts++;
    if (a.correct) cur.correct++;
    wordStats.set(a.wordId, cur);
  }

  const wordsAttempted = wordStats.size;

  // masteredTodayCount per schema doc = UserWord.masteredAt events within [start, end).
  // learningCount = today attempts on words not yet mastered (masteredAt IS NULL).
  // newCount = firstAttemptedAt within [start, end).
  const userWordMap = new Map(userWordRows.map((uw) => [uw.wordId, uw]));
  const settingsRow = await prisma.userSettings.findUnique({
    where: { userId },
    select: { masteryThreshold: true },
  });
  const masteryThreshold = settingsRow?.masteryThreshold ?? MASTERY_THRESHOLD_FALLBACK;
  let newCount = 0;
  let learningCount = 0;
  let masteredCount = 0;
  for (const wordId of todayWordIds) {
    const uw = userWordMap.get(wordId);
    if (!uw) {
      newCount += 1;
      continue;
    }
    if (uw.masteredAt !== null && uw.masteredAt >= start && uw.masteredAt < end) {
      masteredCount += 1;
    } else if (uw.firstAttemptedAt && uw.firstAttemptedAt >= start && uw.masteredAt === null) {
      newCount += 1;
    } else if (uw.masteredAt === null) {
      learningCount += 1;
    }
  }

  const topMissed = [...wordStats.entries()]
    .map(([wordId, w]) => ({
      wordId,
      spelling: w.spelling,
      pos: w.pos,
      glosses: JSON.parse(w.glosses),
      mistakes: w.attempts - w.correct,
    }))
    .filter((x) => x.mistakes > 0)
    .sort((a, b) => b.mistakes - a.mistakes)
    .slice(0, 5);

  const wordbookBreakdown: Record<
    string,
    { name: string; attempts: number; correct: number; words: number }
  > = {};
  for (const a of attempts) {
    const wbId = String(a.session.wordbookId);
    const cur = wordbookBreakdown[wbId] ?? {
      name: "",
      attempts: 0,
      correct: 0,
      words: 0,
    };
    if (!cur.name) {
      const wb = await prisma.wordbook.findUnique({
        where: { id: a.session.wordbookId },
        select: { name: true },
      });
      cur.name = wb?.name ?? `词库 #${wbId}`;
    }
    cur.attempts++;
    if (a.correct) cur.correct++;
    wordbookBreakdown[wbId] = cur;
  }
  for (const id of Object.keys(wordbookBreakdown)) {
    wordbookBreakdown[id].words = [
      ...new Set(
        attempts
          .filter((a) => String(a.session.wordbookId) === id)
          .map((a) => a.wordId),
      ),
    ].length;
  }

  return {
    date: fmtDate(date),
    totalAttempts,
    correctCount,
    accuracy: Math.round(accuracy * 1000) / 1000,
    masteredTodayCount: masteredCount,
    learningCount,
    wordsAttempted,
    sessionsCount,
    cumulativeMastered,
    topMissed,
    wordbookBreakdown,
  };
}

export async function snapshotCheckin(userId: number, date: Date): Promise<void> {
  const dateStr = fmtDate(date);
  const existing = await prisma.checkin.findUnique({
    where: { userId_date: { userId, date: dateStr } },
  });
  if (existing) return;
  const data = await computeCheckinData(userId, date);
  await prisma.checkin.create({
    data: {
      userId,
      date: data.date,
      totalAttempts: data.totalAttempts,
      correctCount: data.correctCount,
      accuracy: data.accuracy,
      masteredTodayCount: data.masteredTodayCount,
      learningCount: data.learningCount,
      wordsAttempted: data.wordsAttempted,
      sessionsCount: data.sessionsCount,
      cumulativeMastered: data.cumulativeMastered,
      topMissedJson: JSON.stringify(data.topMissed),
      wordbookBreakdownJson: JSON.stringify(data.wordbookBreakdown),
    },
  });
}

export async function snapshotAllDatesWithAttempts(userId: number): Promise<number> {
  const dates = await prisma.attempt.findMany({
    where: { userId },
    select: { createdAt: true },
  });
  const dateSet = new Set(dates.map((d) => fmtDate(d.createdAt)));
  for (const dateStr of dateSet) {
    const [y, mo, d] = dateStr.split("-").map(Number);
    await snapshotCheckin(userId, new Date(y, mo - 1, d));
  }
  return dateSet.size;
}

export async function readCheckin(
  userId: number,
  date: Date,
): Promise<(CheckinData & { weekday: string; isToday: boolean }) | null> {
  const dateStr = fmtDate(date);
  const row = await prisma.checkin.findUnique({
    where: { userId_date: { userId, date: dateStr } },
  });
  if (!row) return null;
  return {
    date: row.date,
    totalAttempts: row.totalAttempts,
    correctCount: row.correctCount,
    accuracy: row.accuracy,
    masteredTodayCount: row.masteredTodayCount,
    learningCount: row.learningCount,
    wordsAttempted: row.wordsAttempted,
    sessionsCount: row.sessionsCount,
    cumulativeMastered: row.cumulativeMastered,
    topMissed: safeParseJson(row.topMissedJson, []),
    wordbookBreakdown: safeParseJson(row.wordbookBreakdownJson, {}),
    weekday: WEEKDAYS[new Date(row.date + "T00:00:00").getDay()],
    isToday: row.date === fmtDate(new Date()),
  };
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
