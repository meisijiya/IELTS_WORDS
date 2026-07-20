import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseDateParam(raw: string | null): Date {
  const today = new Date();
  if (!raw) return today;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return today;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Mistake {
  wordId: number;
  spelling: string;
  pos: string | null;
  glosses: { pos: string; meaning: string }[];
  mistakes: number;
  level: number;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = parseDateParam(url.searchParams.get("date"));
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
    (w) => w.correct === w.attempts
  ).length;

  const topMissed: Mistake[] = [...wordStats.entries()]
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

  const wordbookBreakdown: Record<string, { name: string; attempts: number; correct: number; words: number }> = {};
  for (const a of attempts) {
    const wbId = String(a.session.wordbookId);
    const cur = wordbookBreakdown[wbId] ?? {
      name: "",
      attempts: 0,
      correct: 0,
      words: 0,
    };
    if (!cur.name) {
      const wb = await prisma.wordbook.findUnique({ where: { id: a.session.wordbookId }, select: { name: true } });
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
          .map((a) => a.wordId)
      ),
    ].length;
  }

  return NextResponse.json({
    date: fmtDate(date),
    weekday: WEEKDAYS[date.getDay()],
    isToday: fmtDate(date) === fmtDate(new Date()),
    wordsAttempted,
    newMasteredCount,
    totalAttempts,
    correctCount,
    accuracy: Math.round(accuracy * 1000) / 1000,
    sessionsCount,
    topMissed,
    cumulativeMastered,
    wordbookBreakdown,
  });
}