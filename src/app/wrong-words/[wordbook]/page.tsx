import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { WrongWordsClient } from "./wrong-words-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ wordbook: string }>;
  searchParams: Promise<{ range?: string; reviewed?: "all" | "remaining" }>;
}

export default async function WrongWordsPage({ params, searchParams }: PageProps) {
  const { wordbook: slug } = await params;
  const { range = "all", reviewed = "remaining" } = await searchParams;

  const wordbook = await prisma.wordbook.findUnique({ where: { slug } });
  if (!wordbook) {
    redirect("/analytics");
  }

  const since = (() => {
    const now = new Date();
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

  const [attempts, todayAttempts] = await Promise.all([
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
        session: { wordbookId: wordbook.id },
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
      select: { wordId: true },
      distinct: ["wordId"],
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

  const mistakes = [...map.values()]
    .filter((m) => m.mistakes > 0 && m.level < 5)
    .sort((a, b) => b.mistakes - a.mistakes || a.correct - b.correct);

  const filteredMistakes = reviewed === "remaining"
    ? mistakes.filter((m) => !reviewedToday.has(m.wordId))
    : mistakes;

  const reviewedCount = mistakes.filter((m) => reviewedToday.has(m.wordId)).length;

  return (
    <WrongWordsClient
      wordbook={{ id: wordbook.id, slug: wordbook.slug, name: wordbook.name }}
      range={range}
      reviewed={reviewed}
      mistakes={filteredMistakes}
      reviewedTodayIds={[...reviewedToday]}
      reviewedTodayCount={reviewedCount}
      allMistakes={mistakes}
    />
  );
}
