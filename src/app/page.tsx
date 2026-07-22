import Link from "next/link";
import { cookies } from "next/headers";
import { CalendarDays, BarChart3, Settings, Pin } from "lucide-react";
import { prisma } from "@/lib/db";
import { ActiveSessionCard } from "./active-session-card";
import { CheckinCalendarCard } from "./checkin-calendar-card";

export const dynamic = "force-dynamic";

interface ActiveSession {
  id: string;
  wordbookId: number;
  wordbookSlug: string;
  wordbookName: string;
  wordIds: number[] | null;
  mode: string;
  totalWords: number;
  correctCount: number;
  startedAt: string;
}

async function getActiveSessions(): Promise<ActiveSession[]> {
  const rows = await prisma.session.findMany({
    where: { endedAt: null },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      wordbookId: true,
      wordIds: true,
      mode: true,
      startedAt: true,
      totalWords: true,
      correctCount: true,
      wordbook: { select: { slug: true, name: true } },
    },
  });

  const activeIds = rows.map((r) => r.id);
  const liveCounts = activeIds.length
    ? await prisma.attempt.groupBy({
        by: ["sessionId", "correct"],
        where: { sessionId: { in: activeIds } },
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

  return rows.map((r) => {
    const live = liveBySession.get(r.id);
    return {
      id: r.id,
      wordbookId: r.wordbookId,
      wordbookSlug: r.wordbook.slug,
      wordbookName: r.wordbook.name,
      wordIds: r.wordIds ? JSON.parse(r.wordIds) : null,
      mode: r.mode,
      totalWords: live ? live.total : r.totalWords,
      correctCount: live ? live.correct : r.correctCount,
      startedAt: r.startedAt.toISOString(),
    };
  });
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function HomePage() {
  const [wordbooks, activeSessions] = await Promise.all([
    prisma.wordbook.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { words: true } } },
    }),
    getActiveSessions(),
  ]);

  const today = fmtDate(new Date());

  return (
    <main className="min-h-screen px-4 py-10 md:px-8 max-w-3xl mx-auto">
      <header className="mb-10 flex items-baseline justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-1">Yasi Words</h1>
          <p className="text-sm text-muted-foreground">
            雅思单词拼写训练 · 选词库开始练习
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link
            href={`/checkin/${today}`}
            className="text-accent hover:text-accent-hover transition inline-flex items-center gap-1.5"
          >
            <CalendarDays className="h-4 w-4" /> 打卡
          </Link>
          <Link
            href="/analytics"
            className="text-accent hover:text-accent-hover transition inline-flex items-center gap-1.5"
          >
            <BarChart3 className="h-4 w-4" /> 分析
          </Link>
          <Link
            href="/settings"
            className="text-accent hover:text-accent-hover transition inline-flex items-center gap-1.5"
          >
            <Settings className="h-4 w-4" /> 设置
          </Link>
        </div>
      </header>

      {activeSessions.length > 0 && (
        <section className="mb-8 p-5 bg-accent-soft/50 border border-accent/30 rounded-xl">
          <h2 className="text-sm font-semibold text-accent mb-1 inline-flex items-center gap-1.5">
            <Pin className="h-4 w-4" /> 未完成会话 · {activeSessions.length} 个
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            点击「继续」会恢复当前会话。点击「结束」会放弃该会话（数据保留为「已完成」状态）。
          </p>
          <div className="space-y-2">
            {activeSessions.map((s) => (
              <ActiveSessionCard key={s.id} session={s} />
            ))}
          </div>
        </section>
      )}

      <CheckinCalendarCard today={today} />

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
          选词库开始
        </h2>
        <div className="grid gap-3">
          {wordbooks.map((wb) => (
            <Link
              key={wb.id}
              href={`/practice/${wb.slug}`}
              className="block p-5 bg-surface border border-border rounded-xl shadow-soft-sm hover:shadow-soft-md hover:border-accent/40 transition"
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-semibold">{wb.name}</h3>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {wb._count.words.toLocaleString()} 词
                </span>
              </div>
              {wb.description && (
                <p className="text-sm text-muted-foreground mt-1">{wb.description}</p>
              )}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}