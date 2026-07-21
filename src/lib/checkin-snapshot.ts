import { prisma } from "@/lib/db";

export interface CheckinData {
  date: string;
  totalAttempts: number;
  correctCount: number;
  accuracy: number;
  newMasteredCount: number;
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

/**
 * Compute the checkin snapshot data for a given date from live Attempt rows.
 * Pure-of-side-effects (only reads DB, returns data); doesn't write.
 */
export async function computeCheckinData(date: Date): Promise<CheckinData> {
  const start = startOfDay(date);
  const end = endOfDay(date);

  const [attempts, cumulativeMastered] = await Promise.all([
    prisma.attempt.findMany({
      where: { createdAt: { gte: start, lt: end } },
      include: { word: true, session: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.word.count({ where: { level: { gte: 5 } } }),
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
  const newMasteredCount = [...wordStats.values()].filter(
    (w) => w.correct === w.attempts,
  ).length;

  const topMissed = [...wordStats.entries()]
    .map(([wordId, w]) => ({
      wordId,
      spelling: w.spelling,
      pos: w.pos,
      glosses: JSON.parse(w.glosses),
      mistakes: w.attempts - w.correct,
      level: 0,
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
    newMasteredCount,
    wordsAttempted,
    sessionsCount,
    cumulativeMastered,
    topMissed,
    wordbookBreakdown,
  };
}

/**
 * Persist a snapshot for `date` (no-op if one already exists). Idempotent:
 * repeated calls are safe — existing snapshot wins so we don't overwrite
 * a frozen historical record.
 */
export async function snapshotCheckin(date: Date): Promise<void> {
  const dateStr = fmtDate(date);
  const existing = await prisma.checkin.findUnique({ where: { date: dateStr } });
  if (existing) return;
  const data = await computeCheckinData(date);
  await prisma.checkin.create({
    data: {
      date: data.date,
      totalAttempts: data.totalAttempts,
      correctCount: data.correctCount,
      accuracy: data.accuracy,
      newMasteredCount: data.newMasteredCount,
      wordsAttempted: data.wordsAttempted,
      sessionsCount: data.sessionsCount,
      cumulativeMastered: data.cumulativeMastered,
      topMissedJson: JSON.stringify(data.topMissed),
      wordbookBreakdownJson: JSON.stringify(data.wordbookBreakdown),
    },
  });
}

/**
 * Snapshot every distinct date that has at least one Attempt row.
 * Used by /api/admin/reset to lock in history before wiping attempts.
 */
export async function snapshotAllDatesWithAttempts(): Promise<number> {
  const dates = await prisma.attempt.findMany({ select: { createdAt: true } });
  const dateSet = new Set(dates.map((d) => fmtDate(d.createdAt)));
  for (const dateStr of dateSet) {
    const [y, mo, d] = dateStr.split("-").map(Number);
    await snapshotCheckin(new Date(y, mo - 1, d));
  }
  return dateSet.size;
}

/**
 * Read a snapshot by date. Returns null if no snapshot exists. The
 * returned object includes `weekday` and `isToday` derived from `date`,
 * matching the shape /api/analytics/daily used to return.
 */
export async function readCheckin(
  date: Date,
): Promise<(CheckinData & { weekday: string; isToday: boolean }) | null> {
  const dateStr = fmtDate(date);
  const row = await prisma.checkin.findUnique({ where: { date: dateStr } });
  if (!row) return null;
  return {
    date: row.date,
    totalAttempts: row.totalAttempts,
    correctCount: row.correctCount,
    accuracy: row.accuracy,
    newMasteredCount: row.newMasteredCount,
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