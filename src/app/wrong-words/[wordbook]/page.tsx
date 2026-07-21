import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { aggregateWordHistories } from "@/lib/word-history";
import { WrongWordsClient } from "./wrong-words-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ wordbook: string }>;
  searchParams: Promise<{ range?: string; reviewed?: "all" | "remaining" }>;
}

export default async function WrongWordsPage({ params, searchParams }: PageProps) {
  const { wordbook: slug } = await params;
  const { range = "all" } = await searchParams;

  const wordbook = await prisma.wordbook.findUnique({ where: { slug } });
  if (!wordbook) {
    redirect("/analytics");
  }

  const now = new Date();

  const since = (() => {
    if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
  })();

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [attempts, todayAttempts, historyAttempts] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        session: { wordbookId: wordbook.id },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: { word: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.attempt.findMany({
      where: {
        session: { wordbookId: wordbook.id, mode: "review" },
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      select: { wordId: true },
      distinct: ["wordId"],
    }),
    prisma.attempt.findMany({
      where: {
        session: { wordbookId: wordbook.id },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { wordId: true, correct: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const reviewedToday = new Set(todayAttempts.map((a) => a.wordId));

  const map = new Map<number, { wordId: number; spelling: string; pos: string | null; glosses: { pos: string; meaning: string }[]; mistakes: number; correct: number; level: number }>();
  for (const a of attempts) {
    const cur = map.get(a.wordId) ?? {
      wordId: a.wordId,
      spelling: a.word.spelling,
      pos: a.word.pos,
      glosses: JSON.parse(a.word.glosses),
      mistakes: 0,
      correct: 0,
      level: a.word.level,
    };
    if (a.correct) cur.correct++;
    else cur.mistakes++;
    map.set(a.wordId, cur);
  }

  // List always shows ALL wrong words; `reviewed` is no longer a list filter
  // (was confusing — user clicks "全部" range and sees empty list because
  // today's reviewed ones got filtered out). Batch card "仅剩余" stays,
  // computed dynamically from reviewedTodayIds.
  const mistakes = [...map.values()]
    .filter((m) => m.mistakes > 0 && m.level < 5)
    .sort((a, b) => b.mistakes - a.mistakes || a.correct - b.correct);

  const reviewedCount = mistakes.filter((m) => reviewedToday.has(m.wordId)).length;

  const wordHistories = aggregateWordHistories(historyAttempts, now);

  return (
    <WrongWordsClient
      wordbook={{ id: wordbook.id, slug: wordbook.slug, name: wordbook.name }}
      range={range}
      mistakes={mistakes}
      reviewedTodayIds={[...reviewedToday]}
      reviewedTodayCount={reviewedCount}
      allMistakes={mistakes}
      wordHistories={wordHistories}
    />
  );
}
