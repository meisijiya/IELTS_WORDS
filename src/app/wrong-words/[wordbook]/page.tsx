import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { aggregateWordHistories } from "@/lib/word-history";
import { WrongWordsClient } from "./wrong-words-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ wordbook: string }>;
  searchParams: Promise<{ range?: string; reviewed?: "all" | "remaining" }>;
}

export default async function WrongWordsPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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

  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { masteryThreshold: true },
  });
  const masteryThreshold = settings?.masteryThreshold ?? 5;

  const [attempts, todayAttempts, historyAttempts] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        userId: user.id,
        session: { wordbookId: wordbook.id },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      include: { word: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.attempt.findMany({
      where: {
        userId: user.id,
        session: { wordbookId: wordbook.id, mode: "review" },
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      select: { wordId: true },
      distinct: ["wordId"],
    }),
    prisma.attempt.findMany({
      where: {
        userId: user.id,
        session: { wordbookId: wordbook.id },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { wordId: true, correct: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const reviewedToday = new Set(todayAttempts.map((a) => a.wordId));

  // Pull per-user level for the words we touched so the "mastered" filter
  // remains user-isolated.
  const wordIds = [...new Set(attempts.map((a) => a.wordId))];
  const userWordRows = wordIds.length
    ? await prisma.userWord.findMany({
        where: { userId: user.id, wordId: { in: wordIds } },
        select: { wordId: true, level: true },
      })
    : [];
  const levelByWord = new Map(userWordRows.map((uw) => [uw.wordId, uw.level]));

  const map = new Map<number, { wordId: number; spelling: string; pos: string | null; glosses: { pos: string; meaning: string }[]; mistakes: number; correct: number; level: number }>();
  for (const a of attempts) {
    const cur = map.get(a.wordId) ?? {
      wordId: a.wordId,
      spelling: a.word.spelling,
      pos: a.word.pos,
      glosses: JSON.parse(a.word.glosses),
      mistakes: 0,
      correct: 0,
      level: levelByWord.get(a.wordId) ?? 0,
    };
    if (a.correct) cur.correct++;
    else cur.mistakes++;
    map.set(a.wordId, cur);
  }

  const mistakes = [...map.values()]
    .filter((m) => m.mistakes > 0 && m.level < masteryThreshold)
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
